// ! Arquivo: deliveryRoutes.js (Gerenciamento de Pedidos e Entregas)
// ! VERSÃO COMPLETA: Inclui Rota de Simulação (6.5), Webhook (7) e Status (8)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
const { protect } = require('./authMiddleware'); // Proteção de usuário geral

// Importa as funções de criação e simulação do AbacatePay
const { createPixQrCode, simulatePixPayment } = require('./abacatePayService');

// --- Constantes de Regras de Negócio ---
const MARKETPLACE_FEE_RATE = 0.05; // 5% do Marketplace (para vendas sem contrato)
const DELIVERY_FEE = 5.00;         // R$ 5,00 que vai para o entregador (se for do Marketplace)


// ===================================================================
// ROTAS DE ADMINISTRAÇÃO E CONTRATO (Usado pelo Seller)
// ===================================================================

/**
 * Rota 1: Contratar ou Demitir Entregador (PUT /api/delivery/contract/:storeId)
 */
router.put('/delivery/contract/:storeId', protectSeller, async (req, res) => {
    const storeId = req.params.storeId;
    const sellerId = req.user.id;
    const { delivery_person_id } = req.body; 

    const [storeCheck] = await pool.execute(
        'SELECT id FROM stores WHERE id = ? AND seller_id = ?',
        [storeId, sellerId]
    );

    if (storeCheck.length === 0) {
        return res.status(403).json({ success: false, message: 'Acesso negado ou loja não encontrada.' });
    }

    try {
        if (delivery_person_id) {
            const [dpCheck] = await pool.execute(
                'SELECT id FROM users WHERE id = ? AND is_delivery_person = TRUE',
                [delivery_person_id]
            );
            if (dpCheck.length === 0) {
                return res.status(400).json({ success: false, message: 'ID fornecido não corresponde a um entregador cadastrado.' });
            }
        }
        
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
 */
router.post('/delivery/orders', protect, async (req, res) => {
    const buyerId = req.user.id;
    const { store_id, items, total_amount } = req.body; 

    if (!store_id || !items || items.length === 0 || !total_amount) {
        return res.status(400).json({ success: false, message: 'Dados do pedido incompletos.' });
    }

    const deliveryCode = Math.random().toString(36).substring(2, 8).toUpperCase(); 
    const amountInCents = Math.round(total_amount * 100);
    const expiresIn = 3600; // 1 hora
    const description = `Pagamento Pedido ${deliveryCode}`;


    try {
        const pixResult = await createPixQrCode(
            amountInCents, 
            expiresIn, 
            description
        );
        
        if (!pixResult.success || !pixResult.qrCodeData.id) {
             throw new Error('Falha ao gerar o QRCode PIX ou ID da transação ausente.');
        }

        const transactionId = pixResult.qrCodeData.id; 

        await pool.query('BEGIN'); 

        const [orderResult] = await pool.execute(
            `INSERT INTO orders (buyer_id, store_id, total_amount, status, delivery_code, payment_transaction_id) 
             VALUES (?, ?, ?, 'Pending Payment', ?, ?)`,
            [buyerId, store_id, total_amount, deliveryCode, transactionId]
        );
        const orderId = orderResult.insertId;

        // (Lógica de Inserção de Itens)

        await pool.query('COMMIT'); 

        res.status(201).json({ 
            success: true, 
            message: 'Pedido criado com sucesso. O pagamento deve ser feito via PIX.', 
            order_id: orderId,
            pix_qr_code: pixResult.qrCodeData 
        });

    } catch (error) {
        await pool.query('ROLLBACK'); 
        console.error('[DELIVERY/ORDERS] Erro no fluxo do pedido:', error.message);
        
        const status = error.message.includes('QRCode PIX') ? 402 : 500;
        res.status(status).json({ success: false, message: error.message || 'Erro interno ao processar pedido.' });
    }
});


/**
 * Rota 3: Vendedor Define Método de Entrega (PUT /api/delivery/orders/:orderId/delivery-method)
 */
router.put('/delivery/orders/:orderId/delivery-method', protectSeller, async (req, res) => {
    const orderId = req.params.orderId;
    const sellerId = req.user.id;
    const { method } = req.body; 

    if (!['Seller', 'Contracted', 'Marketplace'].includes(method)) {
        return res.status(400).json({ success: false, message: 'Método de entrega inválido.' });
    }

    try {
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

        if (method === 'Contracted') {
            deliveryPersonId = store.contracted_delivery_person_id;
            if (!deliveryPersonId) {
                return res.status(400).json({ success: false, message: 'Loja não possui entregador contratado.' });
            }
        }
        
        await pool.execute(
            'UPDATE orders SET delivery_method = ?, status = "Delivering" WHERE id = ?',
            [method, orderId]
        );
        
        if (method !== 'Seller') {
            const [deliveryResult] = await pool.execute(
                `INSERT INTO deliveries (order_id, delivery_person_id, status) VALUES (?, ?, ?)`,
                [orderId, deliveryPersonId, deliveryPersonId ? 'Accepted' : 'Requested']
            );

            if (method === 'Marketplace') {
                 console.log(`[LOGISTICA] NOTIFICANDO entregadores do Marketplace para Pedido ID: ${orderId}`);
            }
            
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
 */
router.get('/delivery/available', protectDeliveryPerson, async (req, res) => {
    const entregadorId = req.user.id;
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
 */
router.put('/delivery/accept/:orderId', protectDeliveryPerson, async (req, res) => {
    const orderId = req.params.orderId;
    const entregadorId = req.user.id;

    if (req.user.is_available === 0) {
        return res.status(400).json({ success: false, message: 'Você já está com uma entrega pendente.' });
    }

    try {
        await pool.query('BEGIN');

        const [deliveryUpdate] = await pool.execute(
            `UPDATE deliveries SET delivery_person_id = ?, status = 'Accepted' 
             WHERE order_id = ? AND status = 'Requested' AND delivery_person_id IS NULL`,
            [entregadorId, orderId]
        );
        
        if (deliveryUpdate.affectedRows === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pedido não disponível ou já aceito.' });
        }

        await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [entregadorId]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: 'Pedido aceito! Boa entrega.' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/ACCEPT] Erro ao aceitar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao aceitar pedido.' });
    }
});

// ===================================================================
// ROTA DE CONFIRMAÇÃO (Usado pelo Entregador ou Vendedor)
// ===================================================================

/**
 * Rota 6: Confirmação de Entrega (POST /api/delivery/confirm)
 */
router.post('/delivery/confirm', protect, async (req, res) => {
    const userId = req.user.id; 
    const { order_id, confirmation_code } = req.body;

    try {
        await pool.query('BEGIN');
        
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
        
        if (order.delivery_method === 'Seller' && !isSeller) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Apenas o vendedor pode confirmar a entrega própria.' });
        }
        if (['Contracted', 'Marketplace'].includes(order.delivery_method) && !isDeliveryPerson) {
             await pool.query('ROLLBACK');
             return res.status(403).json({ success: false, message: 'Apenas o entregador atribuído pode confirmar.' });
        }
        
        let paymentMessage = 'Pagamento em processamento.';
        
        if (order.delivery_method === 'Seller') {
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const sellerEarnings = order.total_amount - marketplaceFee; 
            paymentMessage = `Entrega própria. R$${marketplaceFee.toFixed(2)} retidos, R$${sellerEarnings.toFixed(2)} creditados.`;
        }
        
        else if (order.delivery_method === 'Contracted') {
             const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
             paymentMessage = `Entrega contratada. R$${marketplaceFee.toFixed(2)} de taxa de serviço.`;
        }

        else if (order.delivery_method === 'Marketplace' && order.delivery_person_id) {
            const marketplaceFee = order.total_amount * MARKETPLACE_FEE_RATE;
            const deliveredPayment = DELIVERY_FEE; 
            
            await pool.execute(
                'UPDATE users SET pending_balance = pending_balance + ? WHERE id = ?',
                [deliveredPayment, order.delivery_person_id]
            );
            
            await pool.execute('UPDATE users SET is_available = TRUE WHERE id = ?', [order.delivery_person_id]);
            
            paymentMessage = `Entrega Marketplace. R$${deliveredPayment.toFixed(2)} creditados ao entregador.`;
        }
        
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


// ===================================================================
// ROTA DE SIMULAÇÃO DE TESTE (SANDBOX)
// ===================================================================

/**
 * Rota 6.5: Simular Pagamento (POST /api/delivery/orders/:orderId/simulate-payment)
 * Chamada pelo botão de teste no checkout para disparar o webhook.
 */
router.post('/delivery/orders/:orderId/simulate-payment', protect, async (req, res) => {
    const orderId = req.params.orderId;
    const buyerId = req.user.id;

    console.log(`[SIMULATE] Usuário ${buyerId} tentando simular pagamento para Pedido ${orderId}`);

    try {
        const [orderRows] = await pool.execute(
            "SELECT payment_transaction_id, status FROM orders WHERE id = ? AND buyer_id = ?",
            [orderId, buyerId]
        );

        const order = orderRows[0];

        if (!order) {
            return res.status(404).json({ success: false, message: 'Pedido não encontrado ou não pertence a você.' });
        }
        
        if (order.status !== 'Pending Payment') {
            return res.status(400).json({ success: false, message: 'Este pedido não está mais pendente de pagamento.' });
        }

        if (!order.payment_transaction_id) {
            return res.status(400).json({ success: false, message: 'Pedido não possui ID de transação PIX para simular.' });
        }

        const simulationResult = await simulatePixPayment(order.payment_transaction_id);

        if (simulationResult.success) {
            res.status(200).json({ 
                success: true, 
                message: 'Simulação enviada com sucesso. Aguardando confirmação do webhook...' 
            });
        } else {
            throw new Error('Falha no serviço de simulação.');
        }

    } catch (error) {
        console.error('[SIMULATE] Erro ao simular pagamento:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Erro interno ao simular.' });
    }
});


// ===================================================================
// ROTA DE WEBHOOK (Para Receber Notificações da AbacatePay)
// ===================================================================

/**
 * Rota 7: Webhook para notificações da AbacatePay
 * (POST /api/abacatepay/notifications)
 */
router.post('/abacatepay/notifications', async (req, res) => {
    const notification = req.body;
    
    console.log('🔔 [WEBHOOK ABACATEPAY] Notificação Recebida:', JSON.stringify(notification, null, 2));

    try {
        // (Implementar verificação de assinatura da AbacatePay aqui)

        if (notification.event === 'PAYMENT_APPROVED' && notification.data) {
            const transactionId = notification.data.id;
            const status = notification.data.status;

            if (status === 'APPROVED') {
                await pool.query('BEGIN');
                try {
                    const [result] = await pool.execute(
                        "UPDATE orders SET status = 'Processing' WHERE payment_transaction_id = ? AND status = 'Pending Payment'",
                        [transactionId]
                    );

                    if (result.affectedRows > 0) {
                        console.log(`[WEBHOOK] Pedido (ID Transação: ${transactionId}) atualizado para 'Processing'.`);
                    } else {
                        console.warn(`[WEBHOOK] Pedido (ID Transação: ${transactionId}) não encontrado ou já processado.`);
                    }
                    await pool.query('COMMIT');
                } catch (error) {
                    await pool.query('ROLLBACK');
                    throw error; 
                }
            }
        }
        res.status(200).json({ success: true, message: 'Notificação recebida.' });
    } catch (error) {
        console.error('[WEBHOOK ABACATEPAY] Erro ao processar notificação:', error);
        res.status(200).json({ success: true, message: 'Notificação recebida (com erro interno).' });
    }
});


// ===================================================================
// ! NOVA ROTA ADICIONADA (Para o Polling do checkout.html)
// ===================================================================

/**
 * Rota 8: Checar Status do Pedido (para Polling)
 * (GET /api/delivery/orders/:orderId/status)
 */
router.get('/delivery/orders/:orderId/status', protect, async (req, res) => {
    const orderId = req.params.orderId;
    const buyerId = req.user.id;

    try {
        // 1. Busca o status do pedido
        const [orderRows] = await pool.execute(
            "SELECT status FROM orders WHERE id = ? AND buyer_id = ?",
            [orderId, buyerId]
        );

        const order = orderRows[0];

        if (!order) {
            return res.status(404).json({ success: false, message: 'Pedido não encontrado ou não pertence a você.' });
        }

        // 2. Retorna o status atual para o polling do checkout.html
        res.status(200).json({ success: true, status: order.status });

    } catch (error) {
        console.error('[STATUS] Erro ao checar status do pedido:', error.message);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});


module.exports = router;
