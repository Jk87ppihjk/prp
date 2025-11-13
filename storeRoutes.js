// ! Arquivo: storeRoutes.js (CORRIGIDO - ORDEM DAS ROTAS E CATEGORIAS)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectSeller } = require require('./sellerAuthMiddleware'); // Proteção de Lojista

// ! Configuração do Banco de Dados
const dbConfig = { 
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
}; 
const pool = mysql.createPool(dbConfig);


// -------------------------------------------------------------------
// ROTAS PRIVADAS (para painel.html)
// -------------------------------------------------------------------

/**
 * 1. Rota para BUSCAR a loja do lojista logado (GET /api/stores/mine)
 * ATENÇÃO: ESTA ROTA DEVE VIR ANTES DA ROTA /stores/:id
 */
router.get('/stores/mine', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    console.log(`[STORES/MINE] INÍCIO da busca para Seller ID: ${seller_id}`);
    
    try {
        const [rows] = await pool.execute(
            `SELECT s.*, c.name AS category_name
             FROM stores s
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE s.seller_id = ? LIMIT 1`,
            [seller_id]
        );

        const store = rows[0];

        if (!store) {
            console.warn(`[STORES/MINE] FIM: Loja não encontrada, retornando 404.`);
            return res.status(404).json({ success: false, message: 'Nenhuma loja encontrada para este lojista.' });
        }
        
        console.log(`[STORES/MINE] FIM: Loja ID ${store.id} encontrada, retornando 200.`);
        res.status(200).json({ success: true, store: store });

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
 * Esta rota só será chamada se a rota /stores/mine NÃO for correspondida.
 */
router.get('/stores/:id', async (req, res) => {
    const storeId = req.params.id;
    console.log(`[STORES/:ID] Buscando perfil da loja ID: ${storeId}`);

    try {
        // 1. Buscar os dados da Loja (incluindo o nome da categoria)
        const [storeRows] = await pool.execute(
            `SELECT s.*, c.name AS category_name
             FROM stores s
             LEFT JOIN categories c ON s.category_id = c.id
             WHERE s.id = ? LIMIT 1`, 
            [storeId]
        );

        if (storeRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Loja não encontrada.' });
        }
        
        const store = storeRows[0];
        
        // 2. Buscar os produtos ATIVOS associados a essa loja (para a vitrine)
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
        console.error('[STORES] Erro ao buscar perfil público da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar dados da loja.' });
    }
});


/**
 * 2. Rota para CRIAR uma nova loja (POST /api/stores)
 * USADO PELO store_setup.html
 */
router.post('/stores', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    // CATEGORY_ID ADICIONADO AQUI
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body;
    console.log(`[STORES/POST] INÍCIO da criação de loja para Seller ID: ${seller_id}`);

    if (!name || !address_line1) {
        console.warn(`[STORES/POST] BLOQUEIO: Dados obrigatórios ausentes (Nome ou Endereço).`);
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        // Checagem de existência (o que gera o 409)
        const checkQuery = 'SELECT id FROM stores WHERE seller_id = ?';
        const [existing] = await pool.execute(checkQuery, [seller_id]);
        
        if (existing.length > 0) {
            console.warn(`[STORES/POST] BLOQUEIO: Loja já existe (ID: ${existing[0].id}), retornando 409.`);
            return res.status(409).json({ success: false, message: 'Este lojista já possui uma loja cadastrada.' });
        }

        // Se passar, realiza a inserção (INCLUINDO category_id)
        const insertQuery = `INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url, category_id) 
                             VALUES (?, ?, ?, ?, ?, ?, ?)`;
        
        const [result] = await pool.execute(insertQuery,
            [seller_id, name, bio || null, address_line1, logo_url || null, banner_url || null, category_id || null]
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
    // CATEGORY_ID ADICIONADO AQUI
    const { name, bio, address_line1, logo_url, banner_url, category_id } = req.body;
    console.log(`[STORES/PUT] INÍCIO da atualização da Loja ID ${storeId} para Seller ID: ${seller_id}`);

    if (!name || !address_line1) {
        return res.status(400).json({ success: false, message: 'Nome da loja e Endereço são obrigatórios.' });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE stores SET 
                name = ?, bio = ?, address_line1 = ?, logo_url = ?, banner_url = ?, category_id = ?
             WHERE id = ? AND seller_id = ?`, // Segurança: SÓ PODE ATUALIZAR A PRÓPRIA LOJA
            [name, bio || null, address_line1, logo_url || null, banner_url || null, category_id || null, storeId, seller_id]
        );
        
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
