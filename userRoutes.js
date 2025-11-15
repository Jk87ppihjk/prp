// ! Arquivo: userRoutes.js (Novo arquivo para gestão de dados do comprador/usuário)
const express = require('express');
const router = express.Router();
const pool = require('./config/db'); // Importa o pool central
const { protect } = require('./authMiddleware'); // Importa a middleware de autenticação

// -------------------------------------------------------------------
// ROTAS DO USUÁRIO COMUM (COMPRADOR)
// -------------------------------------------------------------------

/**
 * Rota PUT /api/user/address
 * Objetivo: Permitir que o usuário preencha o endereço obrigatório (acionado pelo protectWithAddress).
 */
router.put('/user/address', protect, async (req, res) => {
    // ID do usuário logado (garantido pelo middleware 'protect')
    const userId = req.user.id; 
    
    // Novos campos de endereço segmentado e WhatsApp
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
            // Isso só deve acontecer se o ID do usuário não existir, o que é improvável
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

// Você pode adicionar outras rotas de usuário aqui, se necessário.

module.exports = router;
