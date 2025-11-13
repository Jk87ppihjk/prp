// ! Arquivo: authMiddleware.js (Atualizado com is_delivery_person)
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
            
            // 2. Buscar o usuário completo no DB, incluindo o novo role
            const [rows] = await pool.execute(
                'SELECT id, full_name, email, is_seller, is_admin, is_delivery_person, is_available, pending_balance FROM users WHERE id = ? LIMIT 1', 
                [decoded.id]
            );
            const user = rows[0];

            if (!user) {
                console.log(`[AUTH/GERAL] ERRO: Usuário ID ${decoded.id} não encontrado no DB.`);
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            // 3. Se o token é válido e o usuário existe, prossegue
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

module.exports = { protect };
