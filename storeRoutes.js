// ! Arquivo: productRoutes.js (Completo e Corrigido para incluir store_id)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protect } = require('./authMiddleware'); 

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
// Rotas de Produtos
// -------------------------------------------------------------------

// 1. Rota para CRIAR um novo produto
router.post('/products', protectSeller, async (req, res) => {
    // ... (Código de criação) ...
});


// 2. Rota para LER a lista de produtos (PÚBLICA - CORRIGIDA)
router.get('/products', async (req, res) => {
    try {
        console.log('[PRODUCTS] Buscando lista de produtos ativos...');
        
        // Query com JOIN para obter nome da loja, vendedor e, crucialmente, o ID da loja.
        const [products] = await pool.execute(
            `SELECT 
                p.*, 
                s.id AS store_id,                 // <-- CORREÇÃO: Seleciona o ID da loja
                s.name AS store_name, 
                u.full_name AS seller_name, 
                u.city 
             FROM products p
             JOIN stores s ON p.seller_id = s.seller_id
             JOIN users u ON p.seller_id = u.id
             WHERE p.is_active = TRUE`
        );
        
        if (products.length > 0) {
            console.log(`[PRODUCTS] Sucesso: Retornando ${products.length} produtos.`);
        } else {
             console.log('[PRODUCTS] Sucesso: Nenhuma produto encontrado.');
        }
        
        res.status(200).json({ success: true, count: products.length, products });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao buscar produtos:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar produtos.' });
    }
});


// 3. Rota para ATUALIZAR um produto
router.put('/products/:id', protectSeller, async (req, res) => {
    // ... (Código de atualização) ...
});


// 4. Rota para DELETAR um produto
router.delete('/products/:id', protectSeller, async (req, res) => {
    // ... (Código de exclusão) ...
});

module.exports = router;
