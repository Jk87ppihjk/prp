// ! Arquivo: uploadRoutes.js (Integrado com CLOUDINARY)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2; // SDK do Cloudinary
const streamifier = require('streamifier'); // Para lidar com streams do buffer
const { protectSeller } = require('./sellerAuthMiddleware'); 

// --- Configuração do Cloudinary ---
// O Cloudinary lê as chaves CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
// diretamente das variáveis de ambiente.
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- Configuração do Multer para MEMÓRIA ---
// Armazena o arquivo na memória (Buffer) em vez do disco.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// Função auxiliar para upload (promisificada)
let uploadFromBuffer = (buffer, folderName) => {
    return new Promise((resolve, reject) => {
        let stream = cloudinary.uploader.upload_stream({
            folder: folderName,
            resource_type: "auto" // Detecta se é imagem ou vídeo
        }, (error, result) => {
            if (result) {
                resolve(result);
            } else {
                reject(error);
            }
        });
        // Envia o buffer do arquivo para o stream do Cloudinary
        streamifier.createReadStream(buffer).pipe(stream);
    });
};


// 1. Rota para UPLOAD de Mídia (Imagens e Vídeos)
// Rota unificada para simplificar (POST /api/upload/media)
router.post('/upload/media', protectSeller, upload.single('media_file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo de mídia enviado.' });
    }

    try {
        const folder = req.file.mimetype.startsWith('video') ? 'fy_videos' : 'marketplace_images';
        
        // A função Multer 'upload.single()' armazena o arquivo em req.file.buffer
        const result = await uploadFromBuffer(req.file.buffer, folder);

        res.status(200).json({ 
            success: true, 
            message: 'Arquivo enviado com sucesso para o Cloudinary.', 
            url: result.secure_url, // URL segura do Cloudinary
            public_id: result.public_id 
        });

    } catch (error) {
        console.error('Erro ao enviar para o Cloudinary:', error);
        res.status(500).json({ success: false, message: 'Falha no upload para o Cloudinary.' });
    }
});

// 2. Rota para DELETAR Mídia (Opcional, mas útil para gestão)
router.delete('/upload/:publicId', protectSeller, async (req, res) => {
    const publicId = req.params.publicId;
    try {
        await cloudinary.uploader.destroy(publicId);
        res.status(200).json({ success: true, message: 'Arquivo deletado do Cloudinary.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Falha ao deletar arquivo.' });
    }
});


module.exports = router;
