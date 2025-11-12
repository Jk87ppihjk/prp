// ! Arquivo: login.js (Rotas de Acesso e Rota Pública de Cidades)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// IMPORTAR SERVIÇO DE E-MAIL (Brevo)
const brevoService = require('./brevoService');

// ! Configuração do Banco de Dados
const dbConfig = { 
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
}; 
const pool = mysql.createPool(dbConfig);
const JWT_SECRET = process.env.JWT_SECRET || 'seu_segredo_jwt_padrao';
const saltRounds = 10; 

// -------------------------------------------------------------------
// 1. ROTA PÚBLICA: LISTAR CIDADES
// Esta é a rota que o access.html e seller_login.html chamam.
// -------------------------------------------------------------------

router.get('/cities', async (req, res) => {
    try {
        // Seleciona as cidades ativas, sem proteção de login
        const [cities] = await pool.execute(
            'SELECT id, name, state_province FROM cities WHERE is_active = TRUE ORDER BY name'
        );
        res.status(200).json({ success: true, data: cities });
    } catch (error) {
        console.error('Erro ao listar cidades:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar cidades.' });
    }
});


// -------------------------------------------------------------------
// 2. ROTA DE REGISTRO (Cadastro)
// -------------------------------------------------------------------

router.post('/register', async (req, res) => {
    const { email, password, full_name, city, is_seller = false } = req.body;

    if (!email || !password || !full_name || !city) {
        return res.status(400).json({ success: false, message: 'Todos os campos são obrigatórios.' });
    }

    try {
        const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ success: false, message: 'Usuário com este e-mail já existe.' });
        }

        const password_hash = await bcrypt.hash(password, saltRounds);
        
        const [result] = await pool.execute(
            `INSERT INTO users (email, password_hash, full_name, city, is_seller, is_active) 
             VALUES (?, ?, ?, ?, ?, TRUE)`,
            [email, password_hash, full_name, city, is_seller]
        );

        // Envia e-mail de boas-vindas (assumindo que brevoService existe e funciona)
        // brevoService.sendWelcomeEmail(email, full_name);

        res.status(201).json({ success: true, message: 'Usuário registrado com sucesso. Você já pode fazer login.' });

    } catch (error) {
        console.error('Erro de Registro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao registrar usuário.' });
    }
});

// -------------------------------------------------------------------
// 3. ROTA DE LOGIN
// -------------------------------------------------------------------

router.post('/login', async (req, res) => {
    const { email, password, city } = req.body; // City é usado apenas para a validação inicial do frontend

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'E-mail e senha são obrigatórios.' });
    }
    
    // NOTA: Para Admins, o campo 'city' é enviado como 'ADMIN_CITY_GLOBAL' pelo admin_login.html

    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email]);
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos.' });
        }

        const user = users[0];

        const match = await bcrypt.compare(password, user.password_hash);
        
        if (!match) {
            return res.status(401).json({ success: false, message: 'E-mail ou senha inválidos.' });
        }
        
        // Payload JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, is_admin: user.is_admin, is_seller: user.is_seller }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.status(200).json({
            success: true,
            message: 'Login bem-sucedido!',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                is_admin: user.is_admin,
                is_seller: user.is_seller
            }
        });

    } catch (error) {
        console.error('Erro de Login:', error);
        res.status(500).json({ success: false, message: 'Erro interno no processo de login.' });
    }
});


module.exports = router;
