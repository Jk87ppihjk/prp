// ! Arquivo: login.js (Completo e Finalizado)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); 
const brevoService = require('./brevoService'); // Assumindo que este arquivo existe

// --- Configurações de Segurança e Ambiente ---
const SALT_ROUNDS = 10; 
const JWT_SECRET = process.env.JWT_SECRET; 
const TOKEN_EXPIRY = '24h'; 

// ! Configuração do Banco de Dados
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);


// -------------------------------------------------------------------
//                          ROTA DE CADASTRO (/api/register)
// -------------------------------------------------------------------

router.post('/register', async (req, res) => {
    // is_admin é FALSE por segurança no registro via frontend
    const { email, password, city, full_name, is_seller } = req.body; 
    
    // A cidade AINDA É obrigatória no REGISTRO (para ter um valor no DB)
    if (!email || !password || !city) {
        return res.status(400).json({ success: false, message: 'Os campos email, senha e cidade são obrigatórios.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Inserção no Banco de Dados (is_admin é FALSE por padrão)
        await pool.execute(
            'INSERT INTO users (email, password_hash, city, full_name, is_seller, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
            [email, passwordHash, city, full_name || null, is_seller, false] 
        );

        brevoService.sendWelcomeEmail(email, full_name || 'Usuário')
            .catch(err => console.error('Erro ao chamar o serviço Brevo após registro:', err));
        
        res.status(201).json({ 
            success: true, 
            message: `Usuário registrado com sucesso como ${is_seller ? 'Lojista' : 'Comprador'}. Faça login para continuar.`
        });

    } catch (error) {
        if (error.errno === 1062) {
            return res.status(409).json({ success: false, message: 'O email fornecido já está em uso.' });
        }
        console.error('Erro no processo de registro:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});


// -------------------------------------------------------------------
//                           ROTA DE LOGIN (/api/login)
// -------------------------------------------------------------------

router.post('/login', async (req, res) => {
    // A cidade é recebida, mas não será usada na consulta principal
    const { email, password, city } = req.body; 

    // Mantenho a checagem básica para evitar erros do lado do cliente
    // CORREÇÃO: A cidade FOI REMOVIDA da validação de obrigatoriedade.
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Os campos email e senha são obrigatórios.' });
    }

    try {
        // 1. Buscar usuário no BD: APENAS POR EMAIL! (Ignora-se a cidade na consulta SQL)
        const [rows] = await pool.execute(
            'SELECT id, password_hash, email, city, full_name, is_seller, is_admin FROM users WHERE email = ? LIMIT 1', 
            [email]
        );

        const user = rows[0];
        const isPasswordValid = user ? await bcrypt.compare(password, user.password_hash) : false;

        // 2. Validação: Apenas checa email e senha.
        if (!user || !isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou Senha incorretos.' 
            });
        }
        
        // --- LOGIN VÁLIDO (IGNORA REQUISITO DA CIDADE NA CONSULTA) ---
        
        // 3. Geração do JWT
        const tokenPayload = {
            id: user.id,
            email: user.email,
            city: user.city,
            is_seller: user.is_seller,
            is_admin: user.is_admin 
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        
        // 4. Resposta de Sucesso
        res.status(200).json({ 
            success: true, 
            message: `Login bem-sucedido. Bem-vindo(a), ${user.full_name || user.email}!`,
            token: token, 
            user: { 
                id: user.id, 
                email: user.email, 
                city: user.city, 
                name: user.full_name,
                is_seller: user.is_seller,
                is_admin: user.is_admin 
            } 
        });

    } catch (error) {
        console.error('Erro no processo de login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

module.exports = router;
