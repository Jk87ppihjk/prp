// ! Arquivo: adminRoutes.js (CRUD COMPLETO E FINALIZADO)
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { protectAdmin } = require('./adminAuthMiddleware'); 

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
// ROTAS PÚBLICAS (Acessíveis por qualquer cliente/lojista)
// -------------------------------------------------------------------

// ROTA PÚBLICA 1: LISTAR CIDADES
router.get('/cities', async (req, res) => {
    try {
        const [cities] = await pool.execute(
            'SELECT id, name, state_province FROM cities WHERE is_active = TRUE ORDER BY name'
        );
        res.status(200).json({ success: true, data: cities });
    } catch (error) {
        console.error('Erro ao listar cidades públicas:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar cidades.' });
    }
});

// ROTA PÚBLICA 2: LISTAR CATEGORIAS (CORREÇÃO PARA O PAINEL DO LOJISTA)
router.get('/categories', async (req, res) => {
    try {
        const [categories] = await pool.execute('SELECT id, name FROM categories ORDER BY name');
        res.status(200).json({ success: true, categories: categories });
    } catch (error) {
        console.error('[PUBLIC/CATEGORIES] Erro ao buscar categorias:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar categorias.' });
    }
});

// ! adminRoutes.js (ADICIONAR ROTA PÚBLICA DE SUBCATEGORIAS)

// ROTA PÚBLICA 3: LISTAR SUBCATEGORIAS POR CATEGORIA ID
router.get('/subcategories/:categoryId', async (req, res) => {
    const categoryId = req.params.categoryId;
    try {
        const [subcategories] = await pool.execute(
            'SELECT id, name FROM subcategories WHERE category_id = ? ORDER BY name', 
            [categoryId]
        );
        res.status(200).json({ success: true, subcategories: subcategories });
    } catch (error) {
        console.error('[PUBLIC/SUBCATEGORIES] Erro ao buscar subcategorias:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar subcategorias.' });
    }
});

// ! adminRoutes.js (ADICIONAR ROTA PÚBLICA DE ATRIBUTOS)

// ROTA PÚBLICA 4: LISTAR ATRIBUTOS POR SUBCATEGORIA ID
router.get('/attributes/:subcategoryId', async (req, res) => {
    const subcategoryId = req.params.subcategoryId;
    try {
        // Busca ID, Nome e TIPO do atributo, essencial para o frontend renderizar o input correto
        const [attributes] = await pool.execute(
            'SELECT id, name, type FROM attributes WHERE subcategory_id = ? ORDER BY name', 
            [subcategoryId]
        );
        res.status(200).json({ success: true, attributes: attributes });
    } catch (error) {
        console.error('[PUBLIC/ATTRIBUTES] Erro ao buscar atributos:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar atributos.' });
    }
});


// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE CIDADES (CRUD) - PROTEGIDAS POR ADMIN
// -------------------------------------------------------------------

// CREATE
router.post('/admin/cities', protectAdmin, async (req, res) => {
    const { name, state_province } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO cities (name, state_province) VALUES (?, ?)',
            [name, state_province]
        );
        res.status(201).json({ success: true, message: 'Cidade criada com sucesso.', city_id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) { 
            return res.status(409).json({ success: false, message: 'Esta cidade já existe.' });
        }
        console.error('Erro ao criar cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar cidade.' });
    }
});

// READ
router.get('/admin/cities', protectAdmin, async (req, res) => {
    try {
        const [cities] = await pool.execute('SELECT * FROM cities ORDER BY name');
        res.status(200).json({ success: true, data: cities });
    } catch (error) { 
        console.error('Erro ao listar cidades:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar cidades.' });
    }
});

// UPDATE
router.put('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;
    const { name, state_province, is_active } = req.body; 
    try {
        const [result] = await pool.execute(
            'UPDATE cities SET name = ?, state_province = ?, is_active = COALESCE(?, is_active) WHERE id = ?',
            [name, state_province, is_active, cityId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cidade não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Cidade atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar cidade.' });
    }
});

// DELETE
router.delete('/admin/cities/:id', protectAdmin, async (req, res) => {
    const cityId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM cities WHERE id = ?', [cityId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Cidade não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Cidade excluída com sucesso.' });
    } catch (error) {
        if (error.errno === 1451) {
             return res.status(409).json({ success: false, message: 'Não é possível excluir: existem Bairros ou Usuários vinculados a esta cidade.' });
        }
        console.error('Erro ao excluir cidade:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao excluir cidade.' });
    }
});

// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE BAIRROS (CRUD) - PROTEGIDAS POR ADMIN
// -------------------------------------------------------------------

// CREATE
router.post('/admin/districts', protectAdmin, async (req, res) => {
    const { city_id, name } = req.body;
    try {
        const [result] = await pool.execute(
            'INSERT INTO districts (city_id, name) VALUES (?, ?)',
            [city_id, name]
        );
        res.status(201).json({ success: true, message: 'Bairro criado com sucesso.', district_id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) {
            return res.status(409).json({ success: false, message: 'Este bairro já existe nesta cidade.' });
        }
        console.error('Erro ao criar bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar bairro.' });
    }
});

// READ
router.get('/admin/districts', protectAdmin, async (req, res) => {
    try {
        const [districts] = await pool.execute(
            `SELECT d.*, c.name AS city_name, c.state_province 
             FROM districts d
             JOIN cities c ON d.city_id = c.id
             ORDER BY c.name, d.name`
        );
        res.status(200).json({ success: true, data: districts });
    } catch (error) {
        console.error('Erro ao listar bairros:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao listar bairros.' });
    }
});

// UPDATE
router.put('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;
    const { name, city_id } = req.body;
    try {
        const [result] = await pool.execute(
            'UPDATE districts SET name = ?, city_id = ? WHERE id = ?',
            [name, city_id, districtId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Bairro não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Bairro atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao atualizar bairro.' });
    }
});

// DELETE
router.delete('/admin/districts/:id', protectAdmin, async (req, res) => {
    const districtId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM districts WHERE id = ?', [districtId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Bairro não encontrado.' });
        }
        res.status(200).json({ success: true, message: 'Bairro excluído com sucesso.' });
    } catch (error) {
        console.error('Erro ao excluir bairro:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao excluir bairro.' });
    }
});


// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE CATEGORIAS (CRUD) - PROTEGIDAS POR ADMIN
// -------------------------------------------------------------------

// 1. CRIAR Categoria Principal (POST /api/admin/categories)
router.post('/admin/categories', protectAdmin, async (req, res) => {
    const { name } = req.body;
    try {
        const [result] = await pool.execute('INSERT INTO categories (name) VALUES (?)', [name]);
        res.status(201).json({ success: true, message: 'Categoria principal criada.', id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) { return res.status(409).json({ success: false, message: 'Categoria já existe.' }); }
        console.error('[ADMIN/CATEGORIES] Erro ao criar categoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 2. BUSCAR TODAS as Categorias Principais (USO EXCLUSIVO DO ADMIN)
router.get('/admin/categories', protectAdmin, async (req, res) => {
    try {
        const [categories] = await pool.execute('SELECT * FROM categories ORDER BY name');
        res.status(200).json({ success: true, categories: categories });
    } catch (error) {
        console.error('[ADMIN/CATEGORIES] Erro ao buscar categorias:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 3. ATUALIZAR Categoria Principal (PUT /api/admin/categories/:id)
router.put('/admin/categories/:id', protectAdmin, async (req, res) => {
    const categoryId = req.params.id;
    const { name } = req.body;
    try {
        const [result] = await pool.execute('UPDATE categories SET name = ? WHERE id = ?', [name, categoryId]);
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: 'Categoria não encontrada.' }); }
        res.status(200).json({ success: true, message: 'Categoria atualizada.' });
    } catch (error) {
        console.error('[ADMIN/CATEGORIES] Erro ao atualizar categoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 4. DELETAR Categoria Principal (DELETE /api/admin/categories/:id)
router.delete('/admin/categories/:id', protectAdmin, async (req, res) => {
    const categoryId = req.params.id;
    
    // Bloqueia exclusão da Categoria Geral (ID 1)
    if (parseInt(categoryId) === 1) {
        return res.status(403).json({ success: false, message: 'A Categoria Geral não pode ser excluída.' });
    }

    try {
        // Realoca todas as lojas que usam esta categoria para NULL (Fallback)
        await pool.execute('UPDATE stores SET category_id = NULL WHERE category_id = ?', [categoryId]);
        
        // Deleta a categoria
        const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [categoryId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Categoria não encontrada.' });
        }
        res.status(200).json({ success: true, message: 'Categoria deletada e lojas realocadas.' });
    } catch (error) {
        console.error('[ADMIN/CATEGORIES] Erro ao deletar categoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});


// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE SUBCATEGORIAS (CRUD) - PROTEGIDAS POR ADMIN
// -------------------------------------------------------------------

// 5. CRIAR Subcategoria (POST /api/admin/subcategories)
router.post('/admin/subcategories', protectAdmin, async (req, res) => {
    const { name, category_id } = req.body;
    try {
        const [result] = await pool.execute('INSERT INTO subcategories (name, category_id) VALUES (?, ?)', [name, category_id]);
        res.status(201).json({ success: true, message: 'Subcategoria criada.', id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) { return res.status(409).json({ success: false, message: 'Subcategoria já existe nesta categoria.' }); }
        console.error('[ADMIN/SUBCATEGORIES] Erro ao criar subcategoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 6. BUSCAR TODAS as Subcategorias (com nome da categoria)
router.get('/admin/subcategories', protectAdmin, async (req, res) => {
    try {
        const [subcategories] = await pool.execute(
            `SELECT s.*, c.name AS category_name
             FROM subcategories s
             JOIN categories c ON s.category_id = c.id
             ORDER BY c.name, s.name`
        );
        res.status(200).json({ success: true, subcategories: subcategories });
    } catch (error) {
        console.error('[ADMIN/SUBCATEGORIES] Erro ao buscar subcategorias:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 7. DELETAR Subcategoria (DELETE /api/admin/subcategories/:id)
router.delete('/admin/subcategories/:id', protectAdmin, async (req, res) => {
    const subcategoryId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM subcategories WHERE id = ?', [subcategoryId]);

        if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: 'Subcategoria não encontrada.' }); }
        res.status(200).json({ success: true, message: 'Subcategoria e atributos relacionados deletados.' });
    } catch (error) {
        console.error('[ADMIN/SUBCATEGORIES] Erro ao deletar subcategoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 8. ATUALIZAR Subcategoria
router.put('/admin/subcategories/:id', protectAdmin, async (req, res) => {
    const subcategoryId = req.params.id;
    const { name, category_id } = req.body;
    try {
        const [result] = await pool.execute(
            'UPDATE subcategories SET name = ?, category_id = ? WHERE id = ?',
            [name, category_id, subcategoryId]
        );
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: 'Subcategoria não encontrada.' }); }
        res.status(200).json({ success: true, message: 'Subcategoria atualizada.' });
    } catch (error) {
        if (error.errno === 1062) { return res.status(409).json({ success: false, message: 'Subcategoria já existe nesta categoria.' }); }
        console.error('[ADMIN/SUBCATEGORIES] Erro ao atualizar subcategoria:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});


// -------------------------------------------------------------------
// ROTAS DE GESTÃO DE ATRIBUTOS (CRUD) - PROTEGIDAS POR ADMIN
// -------------------------------------------------------------------

// 9. CRIAR Atributo (POST /api/admin/attributes)
router.post('/admin/attributes', protectAdmin, async (req, res) => {
    const { name, type, subcategory_id } = req.body; 
    
    if (!name || !type || !subcategory_id) { return res.status(400).json({ success: false, message: 'Nome, tipo e subcategoria são obrigatórios.' }); }

    try {
        const [result] = await pool.execute('INSERT INTO attributes (name, type, subcategory_id) VALUES (?, ?, ?)', [name, type, subcategory_id]);
        res.status(201).json({ success: true, message: 'Atributo criado.', id: result.insertId });
    } catch (error) {
        if (error.errno === 1062) { return res.status(409).json({ success: false, message: 'Atributo já existe nesta subcategoria.' }); }
        console.error('[ADMIN/ATTRIBUTES] Erro ao criar atributo:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 10. BUSCAR TODOS os Atributos 
router.get('/admin/attributes', protectAdmin, async (req, res) => {
    try {
        const [attributes] = await pool.execute(
            `SELECT a.*, s.name AS subcategory_name, c.name AS category_name
             FROM attributes a
             JOIN subcategories s ON a.subcategory_id = s.id
             JOIN categories c ON s.category_id = c.id
             ORDER BY c.name, s.name, a.name`
        );
        res.status(200).json({ success: true, attributes: attributes });
    } catch (error) {
        console.error('[ADMIN/ATTRIBUTES] Erro ao buscar atributos:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 11. DELETAR Atributo (DELETE /api/admin/attributes/:id)
router.delete('/admin/attributes/:id', protectAdmin, async (req, res) => {
    const attributeId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM attributes WHERE id = ?', [attributeId]);

        if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: 'Atributo não encontrado.' }); }
        res.status(200).json({ success: true, message: 'Atributo deletado.' });
    } catch (error) {
        console.error('[ADMIN/ATTRIBUTES] Erro ao deletar atributo:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

// 12. ATUALIZAR Atributo
router.put('/admin/attributes/:id', protectAdmin, async (req, res) => {
    const attributeId = req.params.id;
    const { name, type, subcategory_id } = req.body;
    try {
        const [result] = await pool.execute(
            'UPDATE attributes SET name = ?, type = ?, subcategory_id = ? WHERE id = ?',
            [name, type, subcategory_id, attributeId]
        );
        if (result.affectedRows === 0) { return res.status(404).json({ success: false, message: 'Atributo não encontrado.' }); }
        res.status(200).json({ success: true, message: 'Atributo atualizado.' });
    } catch (error) {
        if (error.errno === 1062) { return res.status(409).json({ success: false, message: 'Atributo já existe nesta subcategoria.' }); }
        console.error('[ADMIN/ATTRIBUTES] Erro ao atualizar atributo:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});


module.exports = router;
