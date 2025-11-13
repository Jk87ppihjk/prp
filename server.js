// ! Arquivo: server.js (CORRIGIDO PARA MYSQL)
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Carrega as variáveis de ambiente (DB_HOST, JWT_SECRET, etc)

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares Essenciais
app.use(cors());
app.use(express.json());

// --- Importação das Rotas Corretas ---
const loginRoutes = require('./login');
const adminRoutes = require('./adminRoutes');
const productRoutes = require('./productRoutes');
const storeRoutes = require('./storeRoutes');
const fyRoutes = require('./fyRoutes');
const uploadRoutes = require('./uploadRoutes');

// --- Uso das Rotas ---
// O prefixo /api é adicionado aqui para corresponder ao login.js e adminRoutes.js
app.use('/api', loginRoutes);
app.use('/api', adminRoutes);
app.use('/api', productRoutes);
app.use('/api', storeRoutes);
app.use('/api', fyRoutes);
app.use('/api', uploadRoutes); // Suas rotas de upload já incluem /upload no nome

// Rota "raiz" para verificar se o servidor está online
app.get('/', (req, res) => {
    res.send('API do Marketplace está operacional.');
});

// Iniciar o Servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    
    // Log de verificação das variáveis de ambiente
    console.log(`DB_HOST: ${process.env.DB_HOST ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
    console.log(`BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'Configurado' : 'NÃO CONFIGURADO!'}`);
});
