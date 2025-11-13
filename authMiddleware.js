// ! Arquivo: sellerAuthMiddleware.js (CORRIGIDO - LOG ROBUSTO)
const jwt = require('jsonwebtoken');

// --- Configurações de Ambiente ---
const JWT_SECRET = process.env.JWT_SECRET;

// ! Importa o pool compartilhado
const pool = require('./config/db'); // Importa o pool central


/**
 * Middleware para proteger rotas e garantir que APENAS LOJISTAS tenham acesso.
 */
const protectSeller = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            console.log(`[AUTH] Token recebido: ${token.substring(0, 10)}...`);
            
            // 1. Verificar e decodificar o token
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log(`[AUTH] Token decodificado. ID: ${decoded.id}`);
            
            // 2. Buscar o perfil completo (incluindo o flag is_seller) no DB
            const [rows] = await pool.execute(
                'SELECT * FROM users WHERE id = ? LIMIT 1', 
                [decoded.id]
            );
            const user = rows[0];

            if (!user) {
                console.log(`[AUTH] ERRO: Usuário ID ${decoded.id} não encontrado no DB.`);
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            // 3. Verificar a permissão de lojista
            if (!user.is_seller) {
                console.log(`[AUTH] BLOQUEADO: Usuário ID ${user.id} não é um lojista (is_seller=FALSE).`);
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas lojistas podem realizar esta ação.' });
            }

            // 4. Se for lojista (is_seller = TRUE), prossegue
            console.log(`[AUTH] SUCESSO: Lojista ID ${user.id} autorizado.`);
            // Passa os dados frescos do DB para req.user
            req.user = user; 
            
            next();

        } catch (error) {
            // CORREÇÃO: Usa o erro completo se a mensagem estiver vazia
            const errorMessage = error.message || 'Erro de Conexão DB ou JWT_SECRET Inválida.';
            console.error(`[AUTH] FALHA GRAVE: ${errorMessage}. Verifique JWT_SECRET e conexão DB. Detalhe do Erro:`, error);
            
            res.status(401).json({ success: false, message: 'Não autorizado, token inválido ou erro de servidor.' });
        }
    }

    // Se o token estiver ausente
    if (!token) {
        console.log('[AUTH] BLOQUEADO: Token não fornecido.');
        res.status(401).json({ success: false, message: 'Não autorizado, token ausente.' });
    }
};

module.exports = { protectSeller };
