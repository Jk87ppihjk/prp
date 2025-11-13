const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'alpha-super-secret-key'; // Em produção use variável de ambiente

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuração do Multer para Uploads
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Database Setup (SQLite)
const db = new sqlite3.Database('./alpha.db');

db.serialize(() => {
    // Tabela de Usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        full_name TEXT,
        city TEXT,
        is_seller BOOLEAN,
        is_admin BOOLEAN DEFAULT 0
    )`);

    // Tabela de Lojas
    db.run(`CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER UNIQUE,
        name TEXT,
        bio TEXT,
        address_line1 TEXT,
        logo_url TEXT,
        banner_url TEXT,
        FOREIGN KEY(seller_id) REFERENCES users(id)
    )`);

    // Tabela de Produtos
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        name TEXT,
        description TEXT,
        price REAL,
        stock_quantity INTEGER,
        image_url TEXT,
        is_active BOOLEAN DEFAULT 1,
        category TEXT,
        FOREIGN KEY(store_id) REFERENCES stores(id)
    )`);

    // Tabela de Vídeos FY
    db.run(`CREATE TABLE IF NOT EXISTS fy_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER,
        video_url TEXT,
        product_id INTEGER NULL,
        likes_count INTEGER DEFAULT 0,
        FOREIGN KEY(store_id) REFERENCES stores(id)
    )`);

    // Tabela de Cidades (Seed inicial)
    db.run(`CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        state_province TEXT
    )`);
    
    // Seed básico de cidades se estiver vazio
    db.get("SELECT count(*) as count FROM cities", (err, row) => {
        if(row.count === 0) {
            db.run("INSERT INTO cities (name, state_province) VALUES ('São Paulo', 'SP'), ('Rio de Janeiro', 'RJ'), ('Curitiba', 'PR')");
        }
    });
});

// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token required' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- ROTAS DE AUTENTICAÇÃO ---

// Login (SEM validar cidade, apenas email e senha)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'Server error' });
        if (!user) return res.status(400).json({ success: false, message: 'Usuário não encontrado' });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ success: false, message: 'Senha inválida' });

        const token = jwt.sign({ id: user.id, is_seller: user.is_seller, is_admin: user.is_admin }, SECRET_KEY, { expiresIn: '24h' });
        
        // Remove senha do objeto de retorno
        const { password: _, ...userWithoutPass } = user;
        
        res.json({ success: true, token, user: userWithoutPass });
    });
});

// Registro (EXIGE cidade)
app.post('/api/register', (req, res) => {
    const { email, password, city, full_name, is_seller } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);

    db.run(`INSERT INTO users (email, password, full_name, city, is_seller) VALUES (?, ?, ?, ?, ?)`,
        [email, hashedPassword, full_name, city, is_seller],
        function(err) {
            if (err) return res.status(400).json({ success: false, message: 'Email já cadastrado' });
            res.json({ success: true, message: 'Usuário criado com sucesso' });
        }
    );
});

// --- ROTAS DE PRODUTOS E LOJAS ---

app.get('/api/cities', (req, res) => {
    db.all("SELECT * FROM cities", [], (err, rows) => {
        res.json({ success: true, data: rows });
    });
});

// Criar Loja (Seller)
app.post('/api/stores', authenticateToken, (req, res) => {
    const { name, bio, address_line1, logo_url, banner_url } = req.body;
    db.run(`INSERT INTO stores (seller_id, name, bio, address_line1, logo_url, banner_url) VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, name, bio, address_line1, logo_url, banner_url],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'Loja criada' });
        }
    );
});

// Atualizar Loja
app.put('/api/stores/:id', authenticateToken, (req, res) => {
    const { name, bio, address_line1, logo_url, banner_url } = req.body;
    db.run(`UPDATE stores SET name=?, bio=?, address_line1=?, logo_url=?, banner_url=? WHERE id=? AND seller_id=?`,
        [name, bio, address_line1, logo_url, banner_url, req.params.id, req.user.id],
        function(err) {
            res.json({ success: true, message: 'Loja atualizada' });
        }
    );
});

// Obter minha loja
app.get('/api/stores/mine', authenticateToken, (req, res) => {
    db.get("SELECT * FROM stores WHERE seller_id = ?", [req.user.id], (err, row) => {
        if (!row) return res.status(404).json({ success: false, message: 'Loja não encontrada' });
        res.json({ success: true, store: row });
    });
});

// Obter loja por ID (Público)
app.get('/api/stores/:id', (req, res) => {
    db.get("SELECT * FROM stores WHERE id = ?", [req.params.id], (err, store) => {
        if (!store) return res.status(404).json({ success: false });
        db.all("SELECT * FROM products WHERE store_id = ?", [store.id], (err, products) => {
            res.json({ success: true, store, products });
        });
    });
});

// Produtos (Listagem Geral)
app.get('/api/products', (req, res) => {
    // Join simples para pegar nome da loja
    db.all(`SELECT p.*, s.name as store_name 
            FROM products p 
            JOIN stores s ON p.store_id = s.id 
            ORDER BY p.id DESC LIMIT 20`, [], (err, rows) => {
        res.json({ success: true, products: rows });
    });
});

// Produtos por Vendedor
app.get('/api/products/store/:seller_id', (req, res) => {
    db.get("SELECT id FROM stores WHERE seller_id = ?", [req.params.seller_id], (err, store) => {
        if(!store) return res.json({success: true, products: []});
        db.all("SELECT * FROM products WHERE store_id = ?", [store.id], (err, rows) => {
            res.json({ success: true, products: rows });
        });
    });
});

// Criar Produto
app.post('/api/products', authenticateToken, (req, res) => {
    const { name, description, price, stock_quantity, image_url, category } = req.body;
    db.get("SELECT id FROM stores WHERE seller_id = ?", [req.user.id], (err, store) => {
        if (!store) return res.status(400).json({ message: 'Crie uma loja antes' });
        
        db.run(`INSERT INTO products (store_id, name, description, price, stock_quantity, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [store.id, name, description, price, stock_quantity, image_url, category],
            function(err) {
                res.json({ success: true, message: 'Produto criado' });
            }
        );
    });
});

// --- ROTA FY (FEED) ---

app.get('/api/fy', (req, res) => {
    db.all(`SELECT v.*, s.name as store_name, p.name as product_name 
            FROM fy_videos v
            JOIN stores s ON v.store_id = s.id
            LEFT JOIN products p ON v.product_id = p.id
            ORDER BY RANDOM() LIMIT 20`, [], (err, rows) => {
        res.json({ success: true, videos: rows });
    });
});

app.post('/api/fy', authenticateToken, (req, res) => {
    const { video_url, product_id } = req.body;
    db.get("SELECT id FROM stores WHERE seller_id = ?", [req.user.id], (err, store) => {
        if (!store) return res.status(400).json({ message: 'Apenas lojas podem postar' });
        
        db.run(`INSERT INTO fy_videos (store_id, video_url, product_id) VALUES (?, ?, ?)`,
            [store.id, video_url, product_id],
            function(err) {
                res.json({ success: true });
            }
        );
    });
});

app.get('/api/fy/store/:store_id', (req, res) => {
    db.all("SELECT * FROM fy_videos WHERE store_id = ?", [req.params.store_id], (err, rows) => {
        res.json({ success: true, videos: rows });
    });
});

// Upload de Arquivos
app.post('/api/upload/media', upload.single('media_file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    // Retorna URL relativa. Em produção, usar URL completa ou S3.
    // Nota: Para render, isso pode ser efêmero. Ideal usar AWS S3 ou Cloudinary.
    const fullUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ success: true, url: fullUrl });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
