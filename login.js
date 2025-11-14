// ! Arquivo: login.js (CORRIGIDO com Rota GET /user/me)

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); 
const brevoService = require('./brevoService');
const { protect } = require('./authMiddleware'); // Middleware de proteção geral

// --- Configurações de Segurança e Ambiente ---
const SALT_ROUNDS = 10; 
const JWT_SECRET = process.env.JWT_SECRET; 
const TOKEN_EXPIRY = '24h'; 

// ! Importa o pool compartilhado
const pool = require('./config/db'); 

// -------------------------------------------------------------------
//                          ROTA DE CADASTRO (/api/register)
// -------------------------------------------------------------------

router.post('/register', async (req, res) => {
    // Captura 'is_delivery_person'
    const { email, password, city, full_name, is_seller, is_delivery_person } = req.body; 
    
    if (!email || !password || !city) {
        return res.status(400).json({ success: false, message: 'Os campos email, senha e cidade são obrigatórios.' });
    }
    
    // Lógica de segurança: um usuário não pode ser ambos
    if (is_seller && is_delivery_person) {
        return res.status(400).json({ success: false, message: 'Um usuário não pode ser Lojista e Entregador ao mesmo tempo.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Adiciona 'is_delivery_person' no INSERT SQL
        await pool.execute(
            `INSERT INTO users (email, password_hash, city, full_name, is_seller, is_delivery_person, is_admin) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                email, 
                passwordHash, 
                city, 
                full_name || null, 
                is_seller || false,          
                is_delivery_person || false, 
                false                       
            ] 
        );

        brevoService.sendWelcomeEmail(email, full_name || 'Usuário')
            .catch(err => console.error('Erro ao chamar o serviço Brevo após registro:', err));
        
        let roleText = 'Comprador';
        if (is_seller) roleText = 'Lojista';
        if (is_delivery_person) roleText = 'Entregador';

        res.status(201).json({ 
            success: true, 
            message: `Usuário registrado com sucesso como ${roleText}. Você será redirecionado para a configuração inicial.`
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
    const { email, password } = req.body; 

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Os campos email e senha são obrigatórios.' });
    }

    try {
        // Busca o 'is_delivery_person' e 'pending_balance' no SELECT
        const [rows] = await pool.execute(
            'SELECT id, password_hash, email, city, full_name, is_seller, is_admin, is_delivery_person, is_available, pending_balance FROM users WHERE email = ? LIMIT 1', 
            [email]
        );

        const user = rows[0];
        const isPasswordValid = user ? await bcrypt.compare(password, user.password_hash) : false;

        if (!user || !isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou Senha incorretos.' 
            });
        }
        
        // --- LOGIN VÁLIDO ---
        
        // 3. Checagem de Setup Inicial e Definição de Role
        let needsSetup = false;
        let setupType = null;
        let userRole = 'buyer'; 
        
        if (user.is_admin) {
            userRole = 'admin';
        } else if (user.is_delivery_person) {
            userRole = 'delivery_person';
        } else if (user.is_seller) {
            userRole = 'seller';
            const [storeRows] = await pool.execute('SELECT id FROM stores WHERE seller_id = ? LIMIT 1', [user.id]);
            if (storeRows.length === 0) {
                needsSetup = true;
                setupType = 'store_setup'; 
            }
        } else { 
            // Comprador (buyer)
            const [addressRows] = await pool.execute('SELECT id FROM addresses WHERE user_id = ? LIMIT 1', [user.id]);
            if (addressRows.length === 0) {
                needsSetup = true;
                setupType = 'address_setup'; 
            }
        }

        // 4. Geração do JWT
        const tokenPayload = {
            id: user.id,
            email: user.email,
            role: userRole 
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        
        // Retorna o 'role' e o 'is_available'
        res.status(200).json({ 
            success: true, 
            message: `Login bem-sucedido. Bem-vindo(a), ${user.full_name || user.email}!`,
            token: token, 
            role: userRole, 
            needs_setup: needsSetup, 
            setup_type: setupType,   
            user: { 
                id: user.id, 
                email: user.email, 
                city: user.city, 
                name: user.full_name,
                is_seller: user.is_seller,
                is_admin: user.is_admin,
                is_delivery_person: user.is_delivery_person
            } 
        });

    } catch (error) {
        console.error('Erro no processo de login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});


// -------------------------------------------------------------------
// NOVO: ROTA PARA BUSCAR DADOS DO USUÁRIO LOGADO (GET /api/user/me)
// Resolve o 404 e SyntaxError no deliveryPanel.html
// -------------------------------------------------------------------

router.get('/user/me', protect, async (req, res) => {
    const user_id = req.user.id;

    try {
        // Busca todos os dados relevantes, incluindo saldo e status de disponibilidade
        const [rows] = await pool.execute(
            'SELECT id, email, full_name, is_seller, is_admin, is_delivery_person, pending_balance, is_available FROM users WHERE id = ? LIMIT 1', 
            [user_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }
        
        // Retorna os dados, essenciais para o painel do entregador (saldo e is_available)
        res.status(200).json({ success: true, user: rows[0] });

    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});


// -------------------------------------------------------------------
// ROTA PARA SALVAR ENDEREÇO INICIAL DO COMPRADOR (PUT /api/users/address)
// -------------------------------------------------------------------

router.put('/users/address', protect, async (req, res) => {
    const user_id = req.user.id;
    const { city_id, district_id } = req.body;

    if (!city_id || !district_id) {
        return res.status(400).json({ success: false, message: 'City ID e District ID são obrigatórios.' });
    }

    try {
        const [existing] = await pool.execute(
            'SELECT id FROM addresses WHERE user_id = ? LIMIT 1', 
            [user_id]
        );

        if (existing.length > 0) {
            await pool.execute(
                'UPDATE addresses SET city_id = ?, district_id = ? WHERE user_id = ?',
                [city_id, district_id, user_id]
            );
        } else {
            await pool.execute(
                'INSERT INTO addresses (user_id, city_id, district_id) VALUES (?, ?, ?)',
                [user_id, city_id, district_id]
            );
        }

        await pool.execute(
            'UPDATE users SET city = ? WHERE id = ?',
            [city_id, user_id]
        );
        
        res.status(200).json({ success: true, message: 'Endereço principal salvo com sucesso!' });

    } catch (error) {
        console.error('Erro ao salvar endereço:', error);
        if (error.errno === 1452) {
            return res.status(400).json({ success: false, message: 'ID de Cidade ou Bairro inválido.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao salvar endereço.' });
    }
});


module.exports = router;
