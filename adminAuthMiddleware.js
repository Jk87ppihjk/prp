// ! Arquivo: adminAuthMiddleware.js
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const JWT_SECRET = process.env.JWT_SECRET;

// ! Configuração do Banco de Dados (deve ser a mesma em todos os arquivos)
const dbConfig = { 
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
}; 
const pool = mysql.createPool(dbConfig);


/**
 * Middleware para proteger rotas e garantir que APENAS ADMINISTRADORES (is_admin=TRUE) tenham acesso.
 */
const protectAdmin = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            
            // 1. Verificar e decodificar o token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // 2. Buscar o perfil completo (incluindo o flag is_admin) no DB
            const [rows] = await pool.execute(
                'SELECT id, is_admin FROM users WHERE id = ? LIMIT 1', 
                [decoded.id]
            );
            const user = rows[0];

            if (!user) {
                return res.status(401).json({ success: false, message: 'Usuário não encontrado.' });
            }

            // 3. Verificar a permissão de Administrador
            if (!user.is_admin) {
                return res.status(403).json({ success: false, message: 'Acesso negado. Apenas Administradores podem realizar esta ação.' });
            }

            // 4. Se for Admin, prossegue
            req.user = decoded; 
            next();

        } catch (error) {
            console.error('[AUTH ADMIN] Falha na Autorização:', error.message);
            res.status(401).json({ success: false, message: 'Não autorizado, token inválido ou erro de servidor.' });
        }
    }

    if (!token) {
        res.status(401).json({ success: false, message: 'Não autorizado, token ausente.' });
    }
};

module.exports = { protectAdmin };
