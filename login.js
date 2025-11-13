// ! Arquivo: login.js (CORRIGIDO com Rota PUT /users/address)
const express = require('express');
const router = express.Router();
// const mysql = require('mysql2/promise'); // <-- Removido
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); 
const brevoService = require('./brevoService');
const { protect } = require('./authMiddleware'); // <-- NOVO: Importa o middleware de proteção geral

// --- Configurações de Segurança e Ambiente ---
const SALT_ROUNDS = 10; 
const JWT_SECRET = process.env.JWT_SECRET; 
const TOKEN_EXPIRY = '24h'; 

// ! Importa o pool compartilhado
const pool = require('./config/db'); // <-- CORREÇÃO: Importa o pool central

/* // ! Configuração do Banco de Dados (REMOVIDA)
const dbConfig = { ... };
const pool = mysql.createPool(dbConfig);
*/

// -------------------------------------------------------------------
//                          ROTA DE CADASTRO (/api/register)
// -------------------------------------------------------------------

router.post('/register', async (req, res) => {
    // is_admin é FALSE por segurança no registro via frontend
    const { email, password, city, full_name, is_seller } = req.body; 
    
    // A cidade AINDA É obrigatória no REGISTRO
    if (!email || !password || !city) {
        return res.status(400).json({ success: false, message: 'Os campos email, senha e cidade são obrigatórios.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Inserção no Banco de Dados
        await pool.execute(
            'INSERT INTO users (email, password_hash, city, full_name, is_seller, is_admin) VALUES (?, ?, ?, ?, ?, ?)',
            [email, passwordHash, city, full_name || null, is_seller, false] 
        );

        brevoService.sendWelcomeEmail(email, full_name || 'Usuário')
            .catch(err => console.error('Erro ao chamar o serviço Brevo após registro:', err));
        
        // Mensagem pós-registro
        res.status(201).json({ 
            success: true, 
            message: `Usuário registrado com sucesso como ${is_seller ? 'Lojista' : 'Comprador'}. Você será redirecionado para a configuração inicial.`
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
    const { email, password, city } = req.body; 

    // Cidade REMOVIDA da obrigatoriedade
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Os campos email e senha são obrigatórios.' });
    }

    try {
        // 1. Buscar usuário no BD
        const [rows] = await pool.execute(
            'SELECT id, password_hash, email, city, full_name, is_seller, is_admin FROM users WHERE email = ? LIMIT 1', 
            [email]
        );

        const user = rows[0];
        const isPasswordValid = user ? await bcrypt.compare(password, user.password_hash) : false;

        // 2. Validação
        if (!user || !isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email ou Senha incorretos.' 
            });
        }
        
        // --- LOGIN VÁLIDO ---
        
        // 3. Checagem de Setup Inicial (Lojista ou Comprador)
        let needsSetup = false;
        let setupType = null;
        
        if (user.is_admin) {
            // Admin não precisa de setup.
            needsSetup = false;
        } else if (user.is_seller) {
            // Lojista: Checa se JÁ possui uma loja cadastrada na tabela 'stores'
            const [storeRows] = await pool.execute(
                'SELECT id FROM stores WHERE seller_id = ? LIMIT 1', 
                [user.id]
            );
            if (storeRows.length === 0) {
                needsSetup = true;
                setupType = 'store_setup'; // Página de criação de loja
            }
        } else { 
            // Comprador: Checa se JÁ possui um endereço cadastrado na tabela 'addresses'
            // ATENÇÃO: Assumindo que você criou a tabela 'addresses' com o campo 'user_id'.
            const [addressRows] = await pool.execute(
                'SELECT id FROM addresses WHERE user_id = ? LIMIT 1', 
                [user.id]
            );
            if (addressRows.length === 0) {
                needsSetup = true;
                setupType = 'address_setup'; // Página de preenchimento de endereço
            }
        }

        // 4. Geração do JWT
        const tokenPayload = {
            id: user.id,
            email: user.email,
            city: user.city,
            is_seller: user.is_seller,
            is_admin: user.is_admin 
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        
        // 5. Resposta de Sucesso (inclui flags de setup)
        res.status(200).json({ 
            success: true, 
            message: `Login bem-sucedido. Bem-vindo(a), ${user.full_name || user.email}!`,
            token: token, 
            needs_setup: needsSetup, // Flag para forçar o setup
            setup_type: setupType,   // Tipo de setup ('store_setup' ou 'address_setup')
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


// -------------------------------------------------------------------
// NOVO: ROTA PARA SALVAR ENDEREÇO INICIAL DO COMPRADOR (PUT /api/users/address)
// -------------------------------------------------------------------

router.put('/users/address', protect, async (req, res) => {
    const user_id = req.user.id;
    const { city_id, district_id } = req.body;

    if (!city_id || !district_id) {
        return res.status(400).json({ success: false, message: 'City ID e District ID são obrigatórios.' });
    }

    try {
        // A tabela 'addresses' armazena o endereço principal do comprador.
        // Se houver um endereço, atualiza. Se não houver, cria (UPSERT simplificado).
        
        const [existing] = await pool.execute(
            'SELECT id FROM addresses WHERE user_id = ? LIMIT 1', 
            [user_id]
        );

        if (existing.length > 0) {
            // Atualiza o endereço existente
            await pool.execute(
                'UPDATE addresses SET city_id = ?, district_id = ? WHERE user_id = ?',
                [city_id, district_id, user_id]
            );
        } else {
            // Cria um novo endereço (Este é o fluxo principal do setup)
            await pool.execute(
                'INSERT INTO addresses (user_id, city_id, district_id) VALUES (?, ?, ?)',
                [user_id, city_id, district_id]
            );
        }

        // Além disso, é importante atualizar a coluna `city` na tabela `users` para consistência
        // (A coluna `city` original armazena o nome da cidade, mas aqui vamos usar o ID da cidade selecionada, ou o nome).
        // Para simplificar, vamos atualizar o campo `city` na tabela `users` com o ID da cidade:
        await pool.execute(
            'UPDATE users SET city = ? WHERE id = ?',
            [city_id, user_id]
        );
        
        res.status(200).json({ success: true, message: 'Endereço principal salvo com sucesso!' });

    } catch (error) {
        console.error('Erro ao salvar endereço:', error);
        // Pode ser um erro de chave estrangeira (FK) se o city_id ou district_id for inválido
        if (error.errno === 1452) {
            return res.status(400).json({ success: false, message: 'ID de Cidade ou Bairro inválido.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno do servidor ao salvar endereço.' });
    }
});


module.exports = router;
