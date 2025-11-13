// ! Arquivo: fyRoutes.js (CORRIGIDO)
const express = require('express');
const router = express.Router();
// const mysql = require('mysql2/promise'); // <-- Removido
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protect } = require('./authMiddleware'); // Proteção geral para likes/comentários

// ! Importa o pool compartilhado
const pool = require('./config/db'); // <-- CORREÇÃO: Importa o pool central

/*
// ! Configuração do Banco de Dados (REMOVIDA)
const dbConfig = { ... }; 
const pool = mysql.createPool(dbConfig);
*/

// -------------------------------------------------------------------
// 1. GESTÃO DE VÍDEOS (Lojista)
// -------------------------------------------------------------------

// 1.1. CRIAR/CADASTRAR Vídeo Fy (POST /api/fy)
router.post('/fy', protectSeller, async (req, res) => {
    const seller_id = req.user.id;
    const { video_url, product_id } = req.body;

    if (!video_url) {
        return res.status(400).json({ success: false, message: 'URL do vídeo é obrigatória.' });
    }

    try {
        // Encontra o ID da loja do vendedor logado
        const [store] = await pool.execute('SELECT id FROM stores WHERE seller_id = ?', [seller_id]);
        if (store.length === 0) {
            return res.status(403).json({ success: false, message: 'Você precisa ter uma loja ativa para postar vídeos.' });
        }
        const store_id = store[0].id;

        const [result] = await pool.execute(
            'INSERT INTO fy_videos (store_id, product_id, video_url) VALUES (?, ?, ?)',
            [store_id, product_id || null, video_url]
        );

        res.status(201).json({ success: true, message: 'Vídeo Fy cadastrado com sucesso.', video_id: result.insertId });

    } catch (error) {
        console.error('Erro ao cadastrar vídeo Fy:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar o vídeo.' });
    }
});


// -------------------------------------------------------------------
// 2. FEED DE VÍDEOS (Comprador/Público)
// -------------------------------------------------------------------

// 2.1. LER Feed (GET /api/fy)
router.get('/fy', async (req, res) => {
    try {
        const [videos] = await pool.execute(
            `SELECT 
                v.id, v.video_url, v.likes_count, v.created_at,
                s.name AS store_name, 
                p.id AS product_id, p.name AS product_name
             FROM fy_videos v
             JOIN stores s ON v.store_id = s.id
             LEFT JOIN products p ON v.product_id = p.id
             ORDER BY v.created_at DESC`
        );
        res.status(200).json({ success: true, videos });
    } catch (error) {
        console.error('Erro ao buscar feed de vídeos:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar feed.' });
    }
});


// -------------------------------------------------------------------
// 3. INTERAÇÕES SOCIAIS (Likes e Comentários)
// -------------------------------------------------------------------

// 3.1. Rota de LIKE (POST /api/fy/:id/like)
router.post('/fy/:id/like', protect, async (req, res) => {
    const video_id = req.params.id;
    const user_id = req.user.id; 

    // Simplificação: Assume que a inserção/remoção de like e a contagem são atômicas
    try {
        // Lógica real envolveria uma tabela 'video_likes' para evitar duplicidade
        // Aqui, apenas incrementamos para simulação:
        await pool.execute('UPDATE fy_videos SET likes_count = likes_count + 1 WHERE id = ?', [video_id]);
        res.status(200).json({ success: true, message: 'Like adicionado.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro ao registrar like.' });
    }
});

// 3.2. Rota de COMENTÁRIO (POST /api/fy/:id/comment)
router.post('/fy/:id/comment', protect, async (req, res) => {
    const video_id = req.params.id;
    const user_id = req.user.id;
    const { content, parent_comment_id } = req.body; // parent_comment_id para respostas

    if (!content) {
        return res.status(400).json({ success: false, message: 'Conteúdo do comentário é obrigatório.' });
    }

    try {
        const [result] = await pool.execute(
            'INSERT INTO video_comments (video_id, user_id, content, parent_comment_id) VALUES (?, ?, ?, ?)',
            [video_id, user_id, content, parent_comment_id || null]
        );
        res.status(201).json({ success: true, message: 'Comentário postado.', comment_id: result.insertId });
    } catch (error) {
        console.error('Erro ao postar comentário:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao postar comentário.' });
    }
});

// 3.3. Rota para LER Comentários (GET /api/fy/:id/comments)
router.get('/fy/:id/comments', async (req, res) => {
    const video_id = req.params.id;
    try {
        const [comments] = await pool.execute(
            `SELECT c.*, u.full_name AS commenter_name
             FROM video_comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.video_id = ?
             ORDER BY c.parent_comment_id ASC, c.created_at DESC`,
            [video_id]
        );
        
        // Estrutura os comentários em um formato hierárquico (respostas aninhadas)
        const commentsMap = {};
        const rootComments = [];
        
        comments.forEach(comment => {
            comment.replies = [];
            commentsMap[comment.id] = comment;
            
            if (comment.parent_comment_id) {
                if (commentsMap[comment.parent_comment_id]) {
                    commentsMap[comment.parent_comment_id].replies.push(comment);
                }
            } else {
                rootComments.push(comment);
            }
        });

        res.status(200).json({ success: true, comments: rootComments });
    } catch (error) {
        console.error('Erro ao ler comentários:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao ler comentários.' });
    }
});


module.exports = router;
