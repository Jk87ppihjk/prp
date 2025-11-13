// ! Arquivo: deliveryRoutes.js (Gerenciamento de Pedidos e Entregas)
const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
const { protect } = require('./authMiddleware'); // Proteção de usuário geral

// --- Constantes de Regras de Negócio ---
const MARKETPLACE_FEE_RATE = 0.05; // 5% do Marketplace (para vendas sem contrato)
const DELIVERY_FEE = 5.00;         // R$ 5,00 que vai para o entregador (se for do Marketplace)


// ===================================================================
// ROTAS DE ADMINISTRAÇÃO E CONTRATO (Usado pelo Seller)
// ===================================================================

/**
 * Rota 1: Contratar ou Demitir Entregador (PUT /api/delivery/contract/:storeId)
 * O Vendedor usa o ID de um usuário para definir seu entregador contratado.
 */
router.put('/delivery/contract/:storeId', protectSeller, async (req, res) => {
    const storeId = req.params.storeId;
    const sellerId = req.user.id;
    // Pega o ID do Entregador, pode ser NULL para demissão
    const { delivery_person_id } = req.body; 

    // Valida se o vendedor é dono da loja e se o ID da loja está correto
    const [storeCheck] = await pool.execute(
        'SELECT id FROM stores WHERE id = ? AND seller_id = ?',
        [storeId, sellerId]
    );

    if (storeCheck.length === 0) {
        return res.status(403).json({ success: false, message: 'Acesso negado ou loja não encontrada.' });
    }

    try {
        // Se houver um ID, verifica se o usuário é realmente um entregador
        if (delivery_person_id) {
            const [dpCheck] = await pool.execute(
                'SELECT id FROM users WHERE id = ? AND is_delivery_person = TRUE',
                [delivery_person_id]
            );
            if (dpCheck.length === 0) {
                return res.status(400).json({ success: false, message: 'ID fornecido não corresponde a um entregador cadastrado.' });
            }
        }
        
        // Atualiza o campo na tabela stores
        await pool.execute(
            'UPDATE stores SET contracted_delivery_person_id = ? WHERE id = ?',
            [delivery_person_id || null, storeId]
        );

        const status = delivery_person_id ? 'CONTRATADO' : 'DEMITIDO';
        res.status(200).json({ success: true, message: `Entregador ${status} com sucesso!` });

    } catch (error) {
        console.error('[DELIVERY/CONTRACT] Erro ao gerenciar contrato:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar contrato.' });
    }
});


// ===================================================================
// ROTAS DE PEDIDOS (Usado pelo Comprador/Vendedor)
// ===================================================================

/**
 * Rota 2: Cria um NOVO Pedido (POST /api/delivery/orders)
 * Simula a finalização da compra pelo cliente.
 */
router.post('/delivery/orders', protect, async (req, res) => {
    // ATENÇÃO: Esta é uma rota simplificada. Em um sistema real, ela receberia os
    // itens do carrinho, calcularia o total e registraria o pedido.
    const buyerId = req.user.id;
    const { store_id, items, total_amount } = req.body; // Supondo que você enviou items e o total do frontend

    if (!store_id || !items || items.length === 0 || !total_amount) {
        return res.status(400).json({ success: false, message: 'Dados do pedido incompletos.' });
    }

    // Gerar um código de entrega de 6 dígitos para confirmação futura
    const deliveryCode = Math.random().toString(36).substring(2, 8).toUpperCase(); 

    try {
        await pool.query('BEGIN'); // Inicia a transação

        // 1. Cria o Pedido principal
        const [orderResult] = await pool.execute(
            `INSERT INTO orders (buyer_id, store_id, total_amount, status, delivery_code) 
             VALUES (?, ?, ?, 'Processing', ?)`,
            [buyerId, store_id, total_amount, deliveryCode]
        );
        const orderId = orderResult.insertId;

        // 2. Insere os Itens do Pedido (simplificado: você precisará criar a tabela order_items)
        // items.forEach(item => { /* INSERT INTO order_items ... */ });

        await pool.query('COMMIT'); // Finaliza a transação

        // Notifica o vendedor
        // (Lógica de notificação PUSH/Real-time seria implementada aqui)

        res.status(201).json({ 
            success: true, 
            message: 'Pedido criado com sucesso! Vendedor notificado.', 
            order_id: orderId 
        });

    } catch (error) {
        await pool.query('ROLLBACK'); // Desfaz a transação em caso de erro
        console.error('[DELIVERY/ORDERS] Erro ao criar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao criar pedido.' });
    }
});


/**
 * Rota 3: Vendedor Define Método de Entrega (PUT /api/delivery/orders/:orderId/delivery-method)
 * O vendedor escolhe: Eu Entrego / Contratado / Solicitar Marketplace.
 */
router.put('/delivery/orders/:orderId/delivery-method', protectSeller, async (req, res) => {
    const orderId = req.params.orderId;
    const sellerId = req.user.id;
    const { method } = req.body; // 'Seller', 'Contracted', 'Marketplace'

    if (!['Seller', 'Contracted', 'Marketplace'].includes(method)) {
        return res.status(400).json({ success: false, message: 'Método de entrega inválido.' });
    }

    try {
        // 1. Verifica se o vendedor é dono da loja associada ao pedido
        const [orderCheck] = await pool.execute(
            `SELECT o.store_id, s.contracted_delivery_person_id 
             FROM orders o 
             JOIN stores s ON o.store_id = s.id 
             WHERE o.id = ? AND s.seller_id = ?`,
            [orderId, sellerId]
        );

        if (orderCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Acesso negado ou pedido não encontrado.' });
        }
        
        const store = orderCheck[0];
        let deliveryPersonId = null;

        // 2. Define o Entregador, se aplicável
        if (method === 'Contracted') {
            deliveryPersonId = store.contracted_delivery_person_id;
            if (!deliveryPersonId) {
                return res.status(400).json({ success: false, message: 'Loja não possui entregador contratado. Use "Eu Entrego" ou "Marketplace".' });
            }
        }
        
        // 3. Atualiza o status do Pedido e o método de entrega
        await pool.execute(
            'UPDATE orders SET delivery_method = ?, status = "Delivering" WHERE id = ?',
            [method, orderId]
        );
        
        // 4. Se for 'Contratado' ou 'Marketplace', cria o registro de entrega
        if (method !== 'Seller') {
            
            // a. Cria o registro inicial na tabela deliveries
            const [deliveryResult] = await pool.execute(
                `INSERT INTO deliveries (order_id, delivery_person_id, status) VALUES (?, ?, ?)`,
                [orderId, deliveryPersonId, deliveryPersonId ? 'Accepted' : 'Requested']
            );

            // b. Se for Marketplace, NOTIFICA TODOS os entregadores disponíveis (exceto os ocupados)
            if (method === 'Marketplace') {
                 // Esta é a lógica de notificação: na prática, é um PUSH para todos que estão `is_available = TRUE`.
                 // O entregador com `is_available = TRUE` verá o pedido em seu painel.
                 console.log(`[LOGISTICA] NOTIFICANDO entregadores do Marketplace para Pedido ID: ${orderId}`);
            }
            
            // c. Se Contratado, marca o entregador como OCUPADO (is_available = FALSE)
            if (method === 'Contracted' && deliveryPersonId) {
                 await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [deliveryPersonId]);
                 console.log(`[LOGISTICA] Entregador Contratado ID ${deliveryPersonId} está em rota.`);
            }
        }

        res.status(200).json({ success: true, message: `Entrega definida como "${method}".` });

    } catch (error) {
        console.error('[DELIVERY/METHOD] Erro ao definir método de entrega:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao processar a entrega.' });
    }
});


// ===================================================================
// ROTAS DO ENTREGADOR (Usado pelo deliveryPanel.html)
// ===================================================================

/**
 * Rota 4: Entregador: Lista Pedidos Disponíveis (GET /api/delivery/available)
 * Pedidos com delivery_person_id IS NULL AND status = 'Requested' (Marketplace).
 */
router.get('/delivery/available', protectDeliveryPerson, async (req, res) => {
    const entregadorId = req.user.id;
    // Garante que o entregador logado não está ocupado
    if (req.user.is_available === 0) {
         return res.status(200).json({ success: true, message: 'Você está ocupado no momento.', orders: [] });
    }
    
    try {
        const [availableOrders] = await pool.execute(
            `SELECT 
                o.id, o.total_amount, o.delivery_code, 
                s.name AS store_name, u.full_name AS buyer_name
             FROM orders o
             JOIN deliveries d ON o.id = d.order_id
             JOIN stores s ON o.store_id = s.id
             JOIN users u ON o.buyer_id = u.id
             WHERE o.status = 'Delivering' 
               AND d.delivery_person_id IS NULL 
               AND d.status = 'Requested'
             ORDER BY o.created_at ASC`
        );
        
        res.status(200).json({ success: true, orders: availableOrders });
    } catch (error) {
        console.error('[DELIVERY/AVAILABLE] Erro ao listar pedidos:', error);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});

/**
 * Rota 5: Entregador: Aceitar Pedido (PUT /api/delivery/accept/:orderId)
 * Um entregador aceita um pedido do Marketplace.
 */
router.put('/delivery/accept/:orderId', protectDeliveryPerson, async (req, res) => {
    const orderId = req.params.orderId;
    const entregadorId = req.user.id;

    if (req.user.is_available === 0) {
        return res.status(400).json({ success: false, message: 'Você já está com uma entrega pendente.' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Atualiza a entrega com o ID do entregador e status 'Accepted'
        const [deliveryUpdate] = await pool.execute(
            `UPDATE deliveries SET delivery_person_id = ?, status = 'Accepted' 
             WHERE order_id = ? AND status = 'Requested' AND delivery_person_id IS NULL`,
            [entregadorId, orderId]
        );
        
        if (deliveryUpdate.affectedRows === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pedido não disponível ou já aceito.' });
        }

        // 2. Marca o entregador como OCUPADO
        await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [entregadorId]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: 'Pedido aceito! Boa entrega.' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/ACCEPT] Erro ao aceitar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao aceitar pedido.' });
    }
});

// -------------------------------------------------------------------
// ROTA DE CONFIRMAÇÃO (Usado pelo Entregador ou Vendedor)
// -------------------------------------------------------------------

/**
 * Rota 6: Confirmação de Entrega (POST /api/delivery/confirm)
 * Confirma a entrega via código (entregador/vendedor) e atualiza o saldo.
 */
router.post('/delivery/confirm', protect, async (req, res) => {
    const userId = req.user.id; // Pode ser Seller ou Delivery Person
    const { order_id, confirmation_code } = req.body;

    try {
        await pool.query('BEGIN');
        
        // 1. Busca o pedido e verifica o código
        const [orderRows] = await pool.execute(
            `SELECT o.*, s.seller_id, s.contracted_delivery_person_id, d.delivery_person_id 
             FROM orders o
             JOIN stores s ON o.store_id = s.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             WHERE o.id = ? AND o.delivery_code = ? AND o.status = 'Delivering'`,
            [order_id, confirmation_code]
        );

        const order = orderRows[0];
        if (!order) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Código ou pedido inválido.' });
        }

        const isSeller = (order.seller_id === userId);
        const isDeliveryPerson = (order.delivery_person_id === userId);
        
        // 2. Verifica a permissão para confirmar a entrega
        if (order.delivery_method === 'Seller' && !isSeller) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Apenas o vendedor pode confirmar a entrega própria.' });
        }
        if (['Contracted', 'Marketplace'].includes(order.delivery_method) && !isDeliveryPerson) {
             await pool.query('ROLLBACK');
             return res.status(403).json({ success: false, message: 'Apenas o entregador atribuído pode confirmar.' });
        }
        
        // 3. Processamento Financeiro e Status
        let paymentMessage = 'Pagamento em processamento.';
        
        // ** REGRA 1: ENTREGA PRÓPRIA (Seller)**
        if (order.delivery_method === 'Seller') {
            // Vendedor fica com 95% do total - (Total * 5% marketplace)
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const sellerEarnings = order.total_amount - marketplaceFee; 
            
            // (Futuro: Atualizar saldo do Vendedor aqui)
            paymentMessage = `Entrega própria. O marketplace reteve R$${marketplaceFee.toFixed(2)} e R$${sellerEarnings.toFixed(2)} serão creditados ao vendedor.`;
        }
        
        // ** REGRA 2: ENTREGA CONTRATADA (Contracted)**
        else if (order.delivery_method === 'Contracted') {
             // O marketplace não interfere na taxa de entrega. Apenas cobra a taxa de 5% da venda.
             const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
             // (Futuro: Creditar (order.total_amount - marketplaceFee) no saldo do Vendedor)
             paymentMessage = `Entrega contratada. R$${marketplaceFee.toFixed(2)} de taxa de serviço do marketplace.`;
        }

        // ** REGRA 3: ENTREGA DO MARKETPLACE (Marketplace)**
        else if (order.delivery_method === 'Marketplace' && order.delivery_person_id) {
            // A comissão total de R$10.00 já está no preço.
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE; // 5% do Total (produto + frete)
            const deliveredPayment = DELIVERY_FEE; // R$ 5,00 fixos para o Entregador
            
            // 3.1. Credita R$ 5,00 no saldo pendente do Entregador
            await pool.execute(
                'UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
                [deliveredPayment, order.delivery_person_id]
            );
            
            // 3.2. Marca o entregador como DISPONÍVEL
            await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [order.delivery_person_id]);
            
            // 3.3. (Futuro: Creditar o restante no saldo do Vendedor)
            paymentMessage = `Entrega Marketplace. R$${deliveredPayment.toFixed(2)} creditados ao entregador.`;
        }
        
        // 4. Atualiza status da entrega e do pedido para finalizado
        await pool.execute('UPDATE orders SET status = "Completed" WHERE id = ?', [order_id]);
        await pool.execute('UPDATE deliveries SET status = "Delivered_Confirmed", buyer_confirmation_at = NOW() WHERE order_id = ?', [order_id]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: `Entrega confirmada. ${paymentMessage}` });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/CONFIRM] Erro ao confirmar entrega:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao confirmar entrega.' });
    }
});


module.exports = router;
