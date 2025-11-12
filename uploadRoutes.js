// ! Arquivo: uploadRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protectSeller } = require('./sellerAuthMiddleware'); // Apenas lojistas sobem conteúdo

// --- Configuração de Armazenamento Temporário do Multer ---
// Nota: Em produção, você usaria o Multer para enviar diretamente para o S3 ou Cloudinary.
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Simulação: Apenas aceitamos o arquivo, mas ele não persistirá
        cb(null, 'uploads/temp/') 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });


// 1. Rota para UPLOAD de Imagem (POST /api/upload/image)
router.post('/upload/image', protectSeller, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhuma imagem enviada.' });
    }
    // Simulação de retorno da URL externa após upload
    const imageUrl = `https://cdn.marketplacealpha.com/img/${req.file.filename}`;
    res.status(200).json({ 
        success: true, 
        message: 'Imagem processada com sucesso.', 
        url: imageUrl 
    });
});

// 2. Rota para UPLOAD de Vídeo (POST /api/upload/video)
router.post('/upload/video', protectSeller, upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum vídeo enviado.' });
    }
    // Simulação de retorno da URL externa após upload
    const videoUrl = `https://cdn.marketplacealpha.com/videos/${req.file.filename}`;
    res.status(200).json({ 
        success: true, 
        message: 'Vídeo processado com sucesso.', 
        url: videoUrl 
    });
});

module.exports = router;
