// ! Arquivo: authMiddleware.js
const jwt = require('jsonwebtoken');

// ! Chave Secreta: DEVE SER A MESMA USADA NO login.js
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware para verificar a validade do JSON Web Token (JWT)
 * e anexar os dados do usuário à requisição (req.user).
 */
const protect = (req, res, next) => {
    // 1. Verificar se o token está no cabeçalho
    // O token geralmente vem no formato: Authorization: Bearer <token>
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // 2. Extrair apenas o token (ignorar "Bearer ")
            token = req.headers.authorization.split(' ')[1];

            // 3. Verificar o token
            // jwt.verify() decodifica o token usando o JWT_SECRET
            const decoded = jwt.verify(token, JWT_SECRET);

            // 4. Anexar os dados do usuário à requisição
            // Os dados decodificados (id, email, city) agora estão em req.user
            req.user = decoded;
            
            // 5. Chamar 'next()' para prosseguir para a próxima função (a rota principal)
            next();

        } catch (error) {
            console.error('Erro de Autenticação:', error.message);
            // Se a verificação falhar (token inválido ou expirado)
            res.status(401).json({ success: false, message: 'Não autorizado, token falhou.' });
        }
    }

    // Se o cabeçalho Authorization não foi fornecido
    if (!token) {
        res.status(401).json({ success: false, message: 'Não autorizado, nenhum token fornecido.' });
    }
};

module.exports = { protect };
