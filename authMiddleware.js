// ! Arquivo: authMiddleware.js

const jwt = require('jsonwebtoken');
const pool = require('./config/db'); // Assumindo que este caminho está correto

// Middleware para proteger rotas com base no token JWT (função original)
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Adicionado city_id, address_street e role para verificação posterior (para forçar o endereço)
            const [userRows] = await pool.execute(
                `SELECT 
                    id, full_name, email, role, is_available, pending_balance,
                    city_id, district_id, address_street
                FROM users WHERE id = ?`,
                [decoded.id]
            );

            if (userRows.length === 0) {
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            req.user = userRows[0];
            next();

        } catch (error) {
            console.error('Erro de autenticação:', error);
            return res.status(401).json({ success: false, message: 'Não autorizado, token falhou.' });
        }
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Não autorizado, sem token.' });
    }
};

/**
 * NOVA MIDDLEWARE: Força o usuário (Comprador) a ter o endereço completo.
 * Se o endereço for nulo, retorna 403 (Forbidden) com um código para o frontend redirecionar.
 */
exports.protectWithAddress = (req, res, next) => {
    // A função 'protect' já foi executada e anexou 'req.user'
    if (!req.user) {
        // Isso não deve acontecer se 'protect' for chamada primeiro, mas é um bom fallback
        return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    }

    // A obrigatoriedade é apenas para o comprador (role 'user'). Lojista e Entregador usam outras rotas.
    if (req.user.role === 'user') {
        const hasAddress = req.user.city_id && req.user.district_id && req.user.address_street;
        
        if (!hasAddress) {
            // Retorna um código de erro específico (403: Forbidden) para o frontend redirecionar
            return res.status(403).json({ 
                success: false, 
                message: 'É obrigatório completar o cadastro de endereço.',
                code: 'ADDRESS_REQUIRED'
            });
        }
    }
    
    // Se tiver endereço ou não for um usuário comum, prossegue
    next();
};
