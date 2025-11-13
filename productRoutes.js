// ! Arquivo: productRoutes.js (CORRIGIDO PARA O PAINEL)
const express = require('express');
const router = express.Router();
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protect } = require('./authMiddleware'); 
const pool = require('./config/db'); // Importa o pool compartilhado

// -------------------------------------------------------------------
// Rotas de Produtos
// -------------------------------------------------------------------

// 1. Rota para CRIAR um novo produto (PROTEGIDA)
router.post('/products', protectSeller, async (req, res) => {
    const seller_id = req.user.id; 
    
    try {
        const [storeCheck] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        
        if (storeCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'A criação de produtos requer que sua loja esteja cadastrada primeiro.' });
        }
        
        const { name, description, price, stock_quantity, category, image_url } = req.body;

        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Nome e Preço são obrigatórios.' });
        }

        const [result] = await pool.execute(
            `INSERT INTO products 
            (seller_id, name, description, price, stock_quantity, category, image_url) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [seller_id, name, description, price, stock_quantity, category, image_url]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Produto criado com sucesso pelo lojista.', 
            product_id: result.insertId 
        });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao criar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar produto.' });
    }
});


// ! Arquivo: productRoutes.js

// -------------------------------------------------------------------
// Rotas de Produtos
// -------------------------------------------------------------------

// ... (Rota 1: POST /products - CRIAR PRODUTO)

// 2. Rota para LER a lista de produtos (PÚBLICA - COM FILTROS)
router.get('/products', async (req, res) => {
    const categoryId = req.query.category_id;
    const subcategoryId = req.query.subcategory_id;
    
    // Cláusula base para garantir que apenas produtos ativos sejam exibidos
    let whereClause = 'WHERE p.is_active = TRUE';
    const queryParams = [];

    // Adiciona filtro por Categoria Principal
    if (categoryId) {
        // Filtra produtos cuja loja esteja associada à categoria selecionada.
        // O JOIN com 'stores' (s) já está presente na query.
        whereClause += ' AND s.category_id = ?';
        queryParams.push(categoryId);
    }
    
    // Adiciona filtro por Subcategoria
    if (subcategoryId) {
        // NOTA: Assumimos que a tabela 'products' terá, no futuro, a coluna 'subcategory_id'.
        // Se a sua tabela 'products' já tem esta coluna, este filtro funciona:
        whereClause += ' AND p.subcategory_id = ?';
        queryParams.push(subcategoryId);
        
        // Se a sua tabela AINDA NÃO tem p.subcategory_id, mantenha as linhas acima COMENTADAS
        // e adicione p.subcategory_id à sua tabela products.
    }

    try {
        const query = `
            SELECT p.*, s.id AS store_id, s.name AS store_name, u.full_name AS seller_name, u.city 
            FROM products p
            JOIN stores s ON p.seller_id = s.seller_id
            JOIN users u ON p.seller_id = u.id
            ${whereClause}
        `;
        
        const [products] = await pool.execute(query, queryParams);
        
        res.status(200).json({ success: true, count: products.length, products });

    } catch (error) {
        console.error('[PRODUCTS] ERRO ao buscar produtos públicos com filtros:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar produtos.' });
    }
});



// 3. Rota para BUSCAR PRODUTO POR ID (PÚBLICA - PARA product_page.html)
router.get('/products/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const [rows] = await pool.execute(
            `SELECT p.*, s.id AS store_id, s.name AS store_name, u.full_name AS seller_name, u.city 
             FROM products p
             JOIN stores s ON p.seller_id = s.seller_id
             JOIN users u ON p.seller_id = u.id
             WHERE p.id = ? AND p.is_active = TRUE LIMIT 1`,
            [productId]
        );

        const product = rows[0];

        if (!product) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou inativo.' });
        }

        res.status(200).json({ success: true, product });

    } catch (error) {
        console.error('[PRODUCTS/:ID] ERRO ao buscar produto por ID:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar o produto.' });
    }
});


// 4. Rota para LER os produtos DE UM LOJISTA (PROTEGIDA - PARA painel.html)
router.get('/products/store/:sellerId', protectSeller, async (req, res) => {
    const seller_id = req.params.sellerId;

    // A validação de segurança garante que o lojista SÓ PODE ver os SEUS produtos
    if (req.user.id.toString() !== seller_id) {
         return res.status(403).json({ success: false, message: 'Acesso negado. Você não tem permissão para ver estes produtos.' });
    }
    
    try {
        // CORREÇÃO: Busca TODOS os produtos (ativos e inativos) do lojista
        const [products] = await pool.execute(
            'SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC',
            [seller_id]
        );
        
        res.status(200).json({ success: true, products });
    } catch (error) {
        console.error('[PRODUCTS/STORE] Erro ao buscar produtos da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar produtos.' });
    }
});


// 5. Rota para ATUALIZAR um produto (PROTEGIDA)
router.put('/products/:id', protectSeller, async (req, res) => {
    const productId = req.params.id;
    const seller_id = req.user.id; 
    const { name, description, price, stock_quantity, category, image_url, is_active } = req.body;

    try {
        const [result] = await pool.execute(
            `UPDATE products SET 
             name=?, description=?, price=?, stock_quantity=?, category=?, image_url=?, is_active=?
             WHERE id=? AND seller_id=?`,
            [name, description, price, stock_quantity, category, image_url, is_active, productId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou você não tem permissão para editar.' });
        }

        res.status(200).json({ success: true, message: 'Produto atualizado com sucesso.' });

    } catch (error) {
        console.error('[PRODUCTS] Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar produto.' });
    }
});


// 6. Rota para DELETAR (inativar) um produto (PROTEGIDA)
router.delete('/products/:id', protectSeller, async (req, res) => {
    const productId = req.params.id;
    const seller_id = req.user.id; 

    try {
        // Soft delete (apenas marca como inativo)
        const [result] = await pool.execute(
            'UPDATE products SET is_active = FALSE WHERE id = ? AND seller_id = ?',
            [productId, seller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Produto não encontrado ou você não tem permissão para inativar.' });
        }

        res.status(200).json({ success: true, message: 'Produto inativado (soft delete) com sucesso.' });

    } catch (error) {
        console.error('[PRODUCTS] Erro ao deletar produto:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao deletar produto.' });
    }
});

module.exports = router;
