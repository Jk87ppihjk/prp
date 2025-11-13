// ! Arquivo: authMiddleware.js (Middleware de Proteção Geral de Usuário)
const jwt = require('jsonwebtoken');

// ! Importa o pool compartilhado
const pool = require('./config/db'); 

// --- Configurações de Ambiente ---
// O JWT_SECRET é necessário para verificar a validade do token
const JWT_SECRET = process.env.JWT_SECRET;


/**
 * Middleware para proteger rotas que exigem qualquer usuário autenticado (comprador ou lojista).
 * Ex: Rotas de Like, Comentário, Carrinho.
 */
const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Pega o token do cabeçalho (Bearer token)
            token = req.headers.authorization.split(' ')[1];
            
            // 1. Verificar e decodificar o token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // 2. Buscar o usuário completo no DB
            const [rows] = await pool.execute(
                'SELECT id, full_name, email, is_seller, is_admin FROM users WHERE id = ? LIMIT 1', 
                [decoded.id]
            );
            const user = rows[0];

            if (!user) {
                console.log(`[AUTH/GERAL] ERRO: Usuário ID ${decoded.id} não encontrado no DB.`);
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            // 3. Se o token é válido e o usuário existe, prossegue
            console.log(`[AUTH/GERAL] SUCESSO: Usuário ID ${user.id} autorizado para rota geral.`);
            req.user = user; // Anexa os dados do usuário à requisição
            
            next();

        } catch (error) {
            // Erro na verificação do token (expirado, inválido, etc.)
            const errorMessage = error.message || 'Erro na verificação do token.';
            console.error(`[AUTH/GERAL] FALHA: ${errorMessage}. Detalhe do Erro:`, error);
            
            res.status(401).json({ success: false, message: 'Não autorizado, token inválido ou expirado.' });
        }
    }

    // Se o token estiver ausente
    if (!token) {
        console.log('[AUTH/GERAL] BLOQUEADO: Token não fornecido.');
        res.status(401).json({ success: false, message: 'Não autorizado, token ausente.' });
    }
};

module.exports = { protect };
