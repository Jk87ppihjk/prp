// ! Arquivo: login.js (COMPLETO E ATUALIZADO PARA ENTREGADOR)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); 
const brevoService = require('./brevoService');

// --- Configurações de Segurança e Ambiente ---
const SALT_ROUNDS = 10; 
const JWT_SECRET = process.env.JWT_SECRET; 
const TOKEN_EXPIRY = '24h'; 

// ! Importa o pool compartilhado
const pool = require('./config/db'); 

// -------------------------------------------------------------------
//                          ROTA DE CADASTRO (/api/register)
// -------------------------------------------------------------------

router.post('/register', async (req, res) => {
    // Incluindo novo campo is_delivery_person. Deve ser FALSE por padrão no registro público.
    const { email, password, city, full_name, is_seller } = req.body; 
    const is_delivery_person = false; // Entregador é ativado via Admin
    
    if (!email || !password || !city) {
        return res.status(400).json({ success: false, message: 'Os campos email, senha e cidade são obrigatórios.' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Inserção no Banco de Dados: Inclui a coluna is_delivery_person
        await pool.execute(
            'INSERT INTO users (email, password_hash, city, full_name, is_seller, is_admin, is_delivery_person) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [email, passwordHash, city, full_name || null, is_seller, false, is_delivery_person] 
        );

        brevoService.sendWelcomeEmail(email, full_name || 'Usuário')
            .catch(err => console.error('Erro ao chamar o serviço Brevo após registro:', err));
        
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
//                           ROTA DE LOGIN (/api/login)
// -------------------------------------------------------------------

router.post('/login', async (req, res) => {
    const { email, password } = req.body; 

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Os campos email e senha são obrigatórios.' });
    }

    try {
        // 1. Buscar usuário no BD: Inclui o novo campo is_delivery_person
        const [rows] = await pool.execute(
            'SELECT id, password_hash, email, city, full_name, is_seller, is_admin, is_delivery_person FROM users WHERE email = ? LIMIT 1', 
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
        
        // 3. Checagem de Setup Inicial (Ordem de prioridade: Admin > Entregador > Lojista > Comprador)
        let needsSetup = false;
        let setupType = null;
        let role = 'buyer'; // Assume buyer por padrão

        if (user.is_admin) {
            role = 'admin';
            needsSetup = false; // Admin não precisa de setup.
        } else if (user.is_delivery_person) {
            // NOVO: Entregador (painel dedicado)
            role = 'delivery_person';
            // Assumimos que o entregador precisa de um painel simples, mas não de setup forçado por enquanto.
            needsSetup = false; 
        } else if (user.is_seller) {
            role = 'seller';
            // Lojista: Checa se JÁ possui uma loja
            const [storeRows] = await pool.execute(
                'SELECT id FROM stores WHERE seller_id = ? LIMIT 1', 
                [user.id]
            );
            if (storeRows.length === 0) {
                needsSetup = true;
                setupType = 'store_setup'; // Página de criação de loja
            }
        } else { 
            // Comprador: Checa se JÁ possui um endereço
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
            is_admin: user.is_admin,
            is_delivery_person: user.is_delivery_person // NOVO CAMPO
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        
        // 5. Resposta de Sucesso (inclui flags de setup e o role)
        res.status(200).json({ 
            success: true, 
            message: `Login bem-sucedido. Bem-vindo(a), ${user.full_name || user.email}!`,
            token: token, 
            role: role, // Role principal (admin, seller, delivery_person, buyer)
            needs_setup: needsSetup, 
            setup_type: setupType,   
            user: { 
                id: user.id, 
                email: user.email, 
                city: user.city, 
                name: user.full_name,
                is_seller: user.is_seller,
                is_admin: user.is_admin,
                is_delivery_person: user.is_delivery_person // NOVO CAMPO
            } 
        });

    } catch (error) {
        console.error('Erro no processo de login:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
});

module.exports = router;
