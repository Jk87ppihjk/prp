// ! Arquivo: userRoutes.js (Rotas para o Comprador/Usuário)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protect } = require('./authMiddleware'); // Importa a middleware de autenticação

/**
 * Rota GET /api/user/me
 * Objetivo: Permitir que o frontend (ex: checkout.html) busque os dados
 * completos do usuário logado, incluindo o endereço cadastrado.
 */
router.get('/user/me', protect, async (req, res) => {
    // O middleware 'protect' já executou a busca no banco de dados 
    // e anexou os dados do usuário (incluindo o endereço) em 'req.user'.
    
    if (!req.user) {
        // Esta verificação é uma segurança extra, embora 'protect' já trate isso.
        return res.status(404).json({ success: false, message: 'Usuário não encontrado na sessão.' });
    }
    
    // Retorna o objeto 'user' completo que o 'protect' buscou
    res.status(200).json({ success: true, user: req.user });
});

/**
 * Rota PUT /api/user/address
 * Objetivo: Permitir que o usuário (comprador) salve ou atualize 
 * seu endereço segmentado (usado por address_setup.html).
 */
router.put('/user/address', protect, async (req, res) => {
    // ID do usuário logado (garantido pelo middleware 'protect')
    const userId = req.user.id; 
    
    // Campos de endereço segmentado e WhatsApp vindos do frontend
    const { 
        city_id, 
        district_id, 
        address_street, 
        address_number, 
        address_nearby, 
        whatsapp_number 
    } = req.body;

    // 1. Validação: Apenas 'address_nearby' é opcional.
    if (!city_id || !district_id || !address_street || !address_number || !whatsapp_number) {
        return res.status(400).json({ success: false, message: 'Todos os campos de endereço, exceto "Próximo a", e o WhatsApp são obrigatórios.' });
    }

    try {
        // 2. Atualiza a tabela 'users' com os novos dados de endereço
        const [result] = await pool.execute(
            `UPDATE users SET 
                city_id = ?, 
                district_id = ?, 
                address_street = ?, 
                address_number = ?, 
                address_nearby = ?, 
                whatsapp_number = ?
             WHERE id = ?`,
            [
                city_id, 
                district_id, 
                address_street, 
                address_number, 
                address_nearby || null, // Permite null se vazio
                whatsapp_number,
                userId
            ]
        );

        if (result.affectedRows === 0) {
            // Isso só deve acontecer se o ID do usuário não existir
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        res.status(200).json({ success: true, message: 'Endereço e WhatsApp atualizados com sucesso.' });

    } catch (error) {
        console.error('[USER/ADDRESS] Erro ao atualizar endereço do usuário:', error);
        // Erro de FK (cidade ou bairro não existe)
        if (error.errno === 1452) { 
             return res.status(400).json({ success: false, message: 'Cidade ou bairro inválido. Por favor, selecione um valor existente.' });
        }
        res.status(500).json({ success: false, message: 'Erro interno ao salvar endereço.' });
    }
});

module.exports = router;
