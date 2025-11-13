// ! Arquivo: storeRoutes.js (CORRIGIDO - ORDEM DAS ROTAS AJUSTADA)
const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); // Proteção de Lojista
const pool = require('./config/db'); // Importa o pool compartilhado

// -------------------------------------------------------------------
// ROTAS PRIVADAS (para painel.html)
// -------------------------------------------------------------------

/**
 * 1. Rota para BUSCAR a loja do lojista logado (GET /api/stores/mine)
 * USADO PELO painel.html
 * ! IMPORTANTE: Esta rota DEVE vir ANTES de '/stores/:id' para funcionar.
 */
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    console.log(`[STORES/MINE] INÍCIO da busca para Seller ID: ${seller_id}`);
    
    try {
        const query = 'SELECT * FROM stores WHERE seller_id = ? LIMIT 1';
        console.log(`[STORES/MINE] Executando consulta: ${query} com [${seller_id}]`);
        
        const [rows] = await pool.execute(query, [seller_id]);
        
        // ! LOG CRÍTICO
        console.log(`[STORES/MINE] Resultado da consulta: ${rows.length} linha(s) encontrada(s).`);

        if (rows.length === 0) {
            console.warn(`[STORES/MINE] FIM: Loja não encontrada para seller_id ${seller_id}, retornando 404.`);
            // Mensagem de erro específica para esta rota
            return res.status(404).json({ success: false, message: 'Nenhuma loja encontrada para este lojista.' });
        }
        
        console.log(`[STORES/MINE] FIM: Loja ID ${rows[0].id} encontrada, retornando 200.`);
        res.status(200).json({ success: true, store: rows[0] });

    } catch (error) {
        console.error('[STORES/MINE] ERRO FATAL ao buscar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dados da loja.' });
    }
});


// -------------------------------------------------------------------
// ROTA PÚBLICA (para store_profile.html)
// -------------------------------------------------------------------
/**
 * Rota para BUSCAR um perfil de loja pública e seus produtos (GET /api/stores/:id)
 * ! IMPORTANTE: Esta rota deve vir DEPOIS de '/stores/mine'.
 */
router.get('/stores/:id', async (req, res) => {
    const storeId = req.params.id;
    console.log(`[STORES/:ID] Buscando perfil público da Loja ID: ${storeId}`);

    try {
        // 1. Buscar os dados da Loja
        const [storeRows] = await pool.execute(
            'SELECT id, name, bio, address_line1, logo_url, banner_url, seller_id FROM stores WHERE id = ? LIMIT 1', 
            [storeId]
        );

        if (storeRows.length === 0) {
            console.warn(`[STORES/:ID] Loja ID ${storeId} não encontrada, retornando 404.`);
            return res.status(404).json({ success: false, message: 'Loja não encontrada.' });
        }
        
        const store = storeRows[0];
        
        // 2. Buscar os produtos ATIVOS associados a essa loja (usando o seller_id da loja)
        const [productRows] = await pool.execute(
            'SELECT id, name, description, price, image_url FROM products WHERE seller_id = ? AND is_active = TRUE',
            [store.seller_id]
        );

        // 3. Enviar a resposta completa
        res.status(200).json({
            success: true,
            store: store,
            products: productRows
        });

    } catch (error) {
        console.error('[STORES/:ID] Erro ao buscar perfil público da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dados da loja.' });
    }
});


// -------------------------------------------------------------------
// ROTAS PRIVADAS (Continuação)
// -------------------------------------------------------------------

/**
 * 2. Rota para CRIAR uma nova loja (POST /api/stores)
 * USADO PELO store_setup.html
 */
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;
    console.log(`[STORES/POST] INÍCIO da criação de loja para Seller ID: ${seller_id}`);

    if (!name || !address_line1) {
        console.warn(`[STORES/POST] BLOQUEIO: Dados obrigatórios ausentes (Nome ou Endereço).`);
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        // Checagem de existência (o que gera o 409)
        const checkQuery = 'SELECT id FROM stores WHERE seller_id = ?';
        console.log(`[STORES/POST] Verificando loja existente para o Seller ID ${seller_id}...`);
        const [existing] = await pool.execute(checkQuery, [seller_id]);
        
        console.log(`[STORES/POST] Resultado da verificação: ${existing.length} loja(s) encontrada(s).`);
        
        if (existing.length > 0) {
            console.warn(`[STORES/POST] BLOQUEIO: Loja já existe (ID: ${existing[0].id}), retornando 409.`);
            return res.status(409).json({ success: false, message: 'Este lojista já possui uma loja cadastrada.' });
        }

        // Se passar, realiza a inserção
        const insertQuery = `INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url) 
                             VALUES (?, ?, ?, ?, ?, ?)`;
        console.log(`[STORES/POST] Inserindo nova loja no DB...`);
        
        const [result] = await pool.execute(insertQuery,
            [seller_id, name, bio || null, address_line1, logo_url || null, banner_url || null]
        );
        
        console.log(`[STORES/POST] SUCESSO: Loja ID ${result.insertId} criada, retornando 201.`);
        
        res.status(201).json({ 
            success: true, 
            message: 'Loja cadastrada com sucesso!', 
            store_id: result.insertId 
        });

    } catch (error) {
        console.error('[STORES/POST] ERRO FATAL ao criar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar a loja.' });
    }
});

/**
 * 3. Rota para ATUALIZAR uma loja existente (PUT /api/stores/:id)
 * USADO PELO painel.html para salvar
 */
router.put('/stores/:id', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const storeId = req.params.id;
    const { name, bio, address_line1, logo_url, banner_url } = req.body;
    console.log(`[STORES/PUT] INÍCIO da atualização da Loja ID ${storeId} para Seller ID: ${seller_id}`);

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE stores SET 
                name = ?, bio = ?, address_line1 = ?, logo_url = ?, banner_url = ?
             WHERE id = ? AND seller_id = ?`, // Segurança: SÓ PODE ATUALIZAR A PRÓPRIA LOJA
            [name, bio || null, address_line1, logo_url || null, banner_url || null, storeId, seller_id]
        );
        
        console.log(`[STORES/PUT] Linhas afetadas: ${result.affectedRows}`);

        if (result.affectedRows === 0) {
            console.warn(`[STORES/PUT] FIM: Loja ID ${storeId} não encontrada ou sem permissão, retornando 404.`);
            return res.status(404).json({ success: false, message: 'Loja não encontrada ou você não tem permissão para editar.' });
        }
        
        console.log(`[STORES/PUT] SUCESSO: Loja ID ${storeId} atualizada.`);
        res.status(200).json({ success: true, message: 'Loja atualizada com sucesso.' });

    } catch (error) {
        console.error('[STORES/PUT] ERRO FATAL ao atualizar loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar a loja.' });
    }
});

module.exports = router;
