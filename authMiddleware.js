// ! Arquivo: authMiddleware.js (ADICIONADO protectWithAddress e campos de endereço)
const jwt = require('jsonwebtoken');
const pool = require('./config/db'); 

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para proteger rotas que exigem qualquer usuário autenticado (comprador, lojista ou entregador).
 */
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            
            // 1. Verificar e decodificar o token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // 2. Buscar o usuário completo no DB, incluindo roles e NOVOS CAMPOS DE ENDEREÇO
            const [rows] = await pool.execute(
                `SELECT 
                    id, full_name, email, 
                    is_seller, is_admin, is_delivery_person, 
                    is_available, pending_balance,
                    city_id, district_id, address_street, address_number, address_nearby, whatsapp_number
                FROM users WHERE id = ? LIMIT 1`, 
                [decoded.id]
            );
            const user = rows[0];

            if (!user) {
                console.log(`[AUTH/GERAL] ERRO: Usuário ID ${decoded.id} não encontrado no DB.`);
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            // 3. Anexa o usuário ao request
            console.log(`[AUTH/GERAL] SUCESSO: Usuário ID ${user.id} autorizado para rota geral.`);
            req.user = user; 
            
            next();

        } catch (error) {
            const errorMessage = error.message || 'Erro na verificação do token.';
            console.error(`[AUTH/GERAL] FALHA: ${errorMessage}. Detalhe do Erro:`, error);
            
            res.status(401).json({ success: false, message: 'Não autorizado, token inválido ou expirado.' });
        }
    }

    if (!token) {
        console.log('[AUTH/GERAL] BLOQUEADO: Token não fornecido.');
        res.status(401).json({ success: false, message: 'Não autorizado, token ausente.' });
    }
};


/**
 * NOVA MIDDLEWARE: Força o usuário (Comprador) a ter o endereço completo.
 * Aplique esta middleware nas rotas críticas (Ex: Checkout, finalização de compra).
 */
const protectWithAddress = (req, res, next) => {
    // Esta middleware só deve ser aplicada após 'protect'
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Usuário não autenticado.' });
    }

    // A obrigatoriedade é apenas para o comprador (onde role é null/default)
    if (req.user.is_seller === 0 && req.user.is_admin === 0 && req.user.is_delivery_person === 0) {
        const hasAddress = req.user.city_id && req.user.district_id && req.user.address_street && req.user.whatsapp_number;
        
        if (!hasAddress) {
            // Retorna um código de erro específico (403: Forbidden) para o frontend redirecionar
            return res.status(403).json({ 
                success: false, 
                message: 'É obrigatório completar o cadastro de endereço e WhatsApp.',
                code: 'ADDRESS_REQUIRED' // Código para o frontend reconhecer e redirecionar
            });
        }
    }
    
    // Se tiver endereço ou não for um usuário comum, prossegue
    next();
};


module.exports = { protect, protectWithAddress };
