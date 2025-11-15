// ! Arquivo: orderCreationRoutes.js (CORRIGIDO: Endereço Segmentado e Obrigatoriedade)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
// 1. IMPORTAÇÃO: Adicionado 'protectWithAddress'
const { protect, protectWithAddress } = require('./authMiddleware'); 

// Assume-se que 'createPixQrCode' e 'simulatePixPayment' existem
const { createPixQrCode, simulatePixPayment } = require('./abacatePayService'); 

// --- Constantes Comuns ---
const MARKETPLACE_FEE_RATE = 0.05; // 5%
const DELIVERY_FEE = 5.00; // R$ 5,00

// ===================================================================
// FUNÇÃO AUXILIAR DE CRIAÇÃO (Usada por Rota 2 e 2.5)
// ===================================================================

/**
 * 2. FUNÇÃO ATUALIZADA: Recebe 'addressSnapshot' para salvar no pedido.
 */
const createOrderAndCodes = async (buyerId, storeId, totalAmount, initialStatus, transactionId, items, addressSnapshot) => {
    const deliveryCode = Math.random().toString(36).substring(2, 8).toUpperCase(); 
    const pickupCode = Math.random().toString(36).substring(2, 7).toUpperCase(); 

    // 3. SQL ATUALIZADO: Insere o endereço segmentado
    const [orderResult] = await pool.execute(
        `INSERT INTO orders (
            buyer_id, store_id, total_amount, status, delivery_code, payment_transaction_id, delivery_pickup_code,
            delivery_city_id, delivery_district_id, delivery_address_street, 
            delivery_address_number, delivery_address_nearby, buyer_whatsapp_number
         ) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            buyerId, storeId, totalAmount, initialStatus, deliveryCode, transactionId, pickupCode,
            addressSnapshot.city_id, // <-- Novo
            addressSnapshot.district_id, // <-- Novo
            addressSnapshot.address_street, // <-- Novo
            addressSnapshot.address_number, // <-- Novo
            addressSnapshot.address_nearby, // <-- Novo
            addressSnapshot.whatsapp_number // <-- Novo
        ]
    );
    const orderId = orderResult.insertId;

    // Lógica de diminuição de estoque
    for (const item of items) {
        const [stockUpdate] = await pool.execute(
            'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
            [item.qty, item.id, item.qty]
        );
        if (stockUpdate.affectedRows === 0) {
            throw new Error(`Estoque insuficiente para o item ID ${item.id}.`);
        }
    }
    
    return { orderId, deliveryCode, pickupCode };
};

// ===================================================================
// ROTAS DE ADMINISTRAÇÃO E CONTRATO
// ===================================================================

/**
 * Rota 1: Contratar ou Demitir Entregador (PUT /api/delivery/contract/:storeId)
 */
router.put('/contract/:storeId', protectSeller, async (req, res) => {
    // ... (Código original sem alteração) ...
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
// ROTAS DE CRIAÇÃO DE PEDIDOS
// ===================================================================

/**
 * Rota 2: Cria um NOVO Pedido (POST /api/delivery/orders) - FLUXO PIX REAL
 * 4. MIDDLEWARE ATUALIZADA: [protect, protectWithAddress]
 */
router.post('/orders', [protect, protectWithAddress], async (req, res) => {
    const buyerId = req.user.id;
    const { store_id, items, total_amount } = req.body; 

    // 5. AQUISIÇÃO: O endereço vem do req.user (obrigatório pelo middleware)
    const { 
        city_id, district_id, address_street, 
        address_number, address_nearby, whatsapp_number 
    } = req.user;
    
    // Agrupa o endereço para passar para a função auxiliar
    const addressSnapshot = { 
        city_id, district_id, address_street, 
        address_number, address_nearby, whatsapp_number 
    };

    if (!store_id || !items || items.length === 0 || !total_amount) {
        return res.status(400).json({ success: false, message: 'Dados do pedido incompletos.' });
    }

    const amountInCents = Math.round(total_amount * 100);
    const expiresIn = 3600; 

    try {
        const pixResult = await createPixQrCode(amountInCents, expiresIn, 'Pagamento');
        if (!pixResult.success || !pixResult.qrCodeData.id) { 
            throw new Error('Falha ao gerar o QRCode PIX ou ID da transação ausente.');
        }

        await pool.query('BEGIN'); 
        // 6. ATUALIZAÇÃO: Passa o 'addressSnapshot' para a função
        const { orderId } = await createOrderAndCodes(
            buyerId, store_id, total_amount, 'Pending Payment', pixResult.qrCodeData.id, items, addressSnapshot
        );
        await pool.query('COMMIT'); 

        res.status(201).json({ 
            success: true, 
            message: 'Pedido criado com sucesso. Aguardando pagamento.', 
            order_id: orderId,
            pix_qr_code: pixResult.qrCodeData 
        });

    } catch (error) {
        await pool.query('ROLLBACK'); 
        console.error('[DELIVERY/ORDERS] Erro no fluxo do pedido PIX:', error.message);
        const status = error.message.includes('QRCode PIX') ? 402 : 500;
        res.status(status).json({ success: false, message: error.message || 'Erro interno ao processar pedido.' });
    }
});


/**
 * Rota 2.5: Cria um NOVO Pedido - FLUXO SIMULADO (POST /api/delivery/orders/simulate-purchase)
 * 4. MIDDLEWARE ATUALIZADA: [protect, protectWithAddress]
 */
router.post('/orders/simulate-purchase', [protect, protectWithAddress], async (req, res) => {
    const buyerId = req.user.id;
    const { store_id, items, total_amount } = req.body; 

    // 5. AQUISIÇÃO: O endereço vem do req.user
    const { 
        city_id, district_id, address_street, 
        address_number, address_nearby, whatsapp_number 
    } = req.user;
    
    const addressSnapshot = { 
        city_id, district_id, address_street, 
        address_number, address_nearby, whatsapp_number 
    };

    if (!store_id || !items || items.length === 0 || !total_amount) {
        return res.status(400).json({ success: false, message: 'Dados do pedido incompletos.' });
    }

    try {
        await pool.query('BEGIN'); 
        // 6. ATUALIZAÇÃO: Passa o 'addressSnapshot' para a função
        const { orderId } = await createOrderAndCodes(
            buyerId, store_id, total_amount, 'Processing', 'SIMULATED_PURCHASE', items, addressSnapshot
        );
        await pool.query('COMMIT'); 

        res.status(201).json({ 
            success: true, 
            message: 'Pedido simulado criado e pago com sucesso.', 
            order_id: orderId,
            status: 'Processing'
        });

    } catch (error) {
        await pool.query('ROLLBACK'); 
        console.error('[DELIVERY/SIMULATED] Erro no fluxo do pedido simulado:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Erro interno ao processar pedido simulado.' });
    }
});


// ===================================================================
// ROTAS DE PROCESSAMENTO E DESPACHO DO LOJISTA
// ===================================================================

/**
 * Rota 3: Vendedor Define Método de Entrega (PUT /api/delivery/orders/:orderId/delivery-method)
 */
router.put('/orders/:orderId/delivery-method', protectSeller, async (req, res) => {
    // ... (Código original sem alteração) ...
    const orderId = req.params.orderId;
    const sellerId = req.user.id;
    const { method } = req.body; // 'Contracted', 'Marketplace'

    if (!['Contracted', 'Marketplace'].includes(method)) {
        return res.status(400).json({ success: false, message: 'Método de entrega inválido. Use Contracted ou Marketplace.' });
    }

    try {
        const [orderCheck] = await pool.execute(
            `SELECT o.store_id, s.contracted_delivery_person_id, o.status 
             FROM orders o 
             JOIN stores s ON o.store_id = s.id 
             WHERE o.id = ? AND s.seller_id = ?`,
            [orderId, sellerId]
        );

        if (orderCheck.length === 0) {
            return res.status(403).json({ success: false, message: 'Acesso negado ou pedido não encontrado.' });
        }
        
        if (orderCheck[0].status !== 'Processing') {
             return res.status(400).json({ success: false, message: 'O pedido não está no status "Processing" para definir o método de entrega.' });
        }

        const store = orderCheck[0];
        let deliveryPersonId = null;

        if (method === 'Contracted') {
            deliveryPersonId = store.contracted_delivery_person_id;
            if (!deliveryPersonId) {
                return res.status(400).json({ success: false, message: 'Loja não possui entregador contratado. Solicite o Marketplace.' });
            }
        }
        
        await pool.execute(
            'UPDATE orders SET delivery_method = ?, status = "Delivering" WHERE id = ?',
            [method, orderId]
        );
        
        // Cria o registro na tabela 'deliveries'
        await pool.execute(
            `INSERT INTO deliveries (order_id, delivery_person_id, status, delivery_method) VALUES (?, ?, ?, ?)`,
            [orderId, deliveryPersonId, deliveryPersonId ? 'Accepted' : 'Requested', method]
        );

        if (method === 'Contracted' && deliveryPersonId) {
             await pool.execute('UPDATE users SET is_available = FALSE WHERE id = ?', [deliveryPersonId]);
        }

        res.status(200).json({ success: true, message: `Entrega definida como "${method}".` });

    } catch (error) {
        console.error('[DELIVERY/METHOD] Erro ao definir método de entrega:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao processar a entrega.' });
    }
});


/**
 * Rota 9: Vendedor Despacha o Pedido (PUT /api/delivery/orders/:orderId/dispatch)
 */
router.put('/orders/:orderId/dispatch', protectSeller, async (req, res) => {
    // ... (Código original sem alteração) ...
    const orderId = req.params.orderId;
    const sellerId = req.user.id;

    try {
        await pool.query('BEGIN'); 

        // 1. Verifica se o pedido é do vendedor e está em 'Processing'
        const [orderCheck] = await pool.execute(
            `SELECT o.id, s.seller_id FROM orders o 
             JOIN stores s ON o.store_id = s.id 
             WHERE o.id = ? AND s.seller_id = ? AND o.status = 'Processing'`,
            [orderId, sellerId]
        );

        if (orderCheck.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pedido não encontrado, não pertence a você ou não está no status "Processing".' });
        }
        
        // 2. Define o método de entrega como 'Seller' e atualiza o status para 'Delivering'
        await pool.execute(
            "UPDATE orders SET status = 'Delivering', delivery_method = 'Seller' WHERE id = ?",
            [orderId]
        );
        
        // 3. Cria o registro de entrega E REGISTRA O TEMPO DE EMBALAGEM (packing_start_time)
        await pool.execute(
            `INSERT INTO deliveries (order_id, delivery_person_id, status, delivery_method, packing_start_time) 
             VALUES (?, NULL, 'Accepted', 'Seller', NOW())`, 
            [orderId]
        );
        
        await pool.query('COMMIT'); 
        res.status(200).json({ success: true, message: 'Pedido despachado! Pronto para a entrega.' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/DISPATCH] Erro ao despachar pedido:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao despachar.' });
    }
});


/**
 * Rota 12: Vendedor Confirma Retirada do Pedido (PUT /api/delivery/orders/:orderId/confirm-pickup)
 */
router.put('/orders/:orderId/confirm-pickup', protectSeller, async (req, res) => {
    // ... (Código original sem alteração) ...
    const orderId = req.params.orderId;
    const sellerId = req.user.id;
    const { pickup_code } = req.body; 

    try {
        await pool.query('BEGIN');

        // 1. Verifica o pedido, o lojista e se está em 'Delivering'
        const [orderRows] = await pool.execute(
            `SELECT o.id, o.delivery_pickup_code, s.seller_id, d.delivery_person_id, d.status
             FROM orders o 
             JOIN stores s ON o.store_id = s.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             WHERE o.id = ? AND s.seller_id = ? AND o.status = 'Delivering'`,
            [orderId, sellerId]
        );
        const order = orderRows[0];
        
        if (!order || order.delivery_person_id === null || order.delivery_person_id === 0) { // delivery_person_id deve existir aqui
            await pool.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Pedido inválido ou entregador não atribuído.' });
        }

        // 2. Valida o Código de Retirada
        if (order.delivery_pickup_code !== pickup_code) {
             await pool.query('ROLLBACK');
             return res.status(400).json({ success: false, message: 'Código de retirada inválido.' });
        }

        // 3. Registra os tempos de Embalagem (packing_start_time) e Retirada (pickup_time)
        await pool.execute(
            `UPDATE deliveries SET 
             status = 'PickedUp', 
             packing_start_time = NOW(),
             pickup_time = NOW() 
             WHERE order_id = ?`,
            [orderId]
        );

        await pool.query('COMMIT');

        res.status(200).json({ success: true, message: 'Retirada confirmada. Entregador em rota.' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('[DELIVERY/CONFIRM_PICKUP] Erro ao confirmar retirada:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao confirmar retirada.' });
    }
});


/**
 * Rota 6.5: Simular Pagamento (POST /api/delivery/orders/:orderId/simulate-payment)
 */
router.post('/orders/:orderId/simulate-payment', protect, async (req, res) => {
    // ... (Código original sem alteração) ...
    const orderId = req.params.orderId;
    const buyerId = req.user.id;

    try {
        const [orderRows] = await pool.execute(
            "SELECT payment_transaction_id, status FROM orders WHERE id = ? AND buyer_id = ?",
            [orderId, buyerId]
        );

        const order = orderRows[0];
        if (!order) { return res.status(4404).json({ success: false, message: 'Pedido não encontrado ou não pertence a você.' }); }
        if (order.status !== 'Pending Payment') { return res.status(400).json({ success: false, message: 'Este pedido não está mais pendente de pagamento.' }); }
        if (!order.payment_transaction_id) { return res.status(400).json({ success: false, message: 'Pedido não possui ID de transação PIX para simular.' }); }

        const simulationResult = await simulatePixPayment(order.payment_transaction_id);

        if (simulationResult.success) {
            res.status(200).json({ success: true, message: 'Simulação enviada com sucesso. Aguardando confirmação do webhook...' });
        } else {
            throw new Error('Falha no serviço de simulação.');
        }

    } catch (error) {
        console.error('[SIMULATE] Erro ao simular pagamento:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Erro interno ao simular.' });
    }
});


/**
 * Rota 7: Webhook para notificações da AbacatePay (POST /api/abacatepay/notifications)
 */
router.post('/abacatepay/notifications', async (req, res) => {
    // ... (Código original sem alteração) ...
    const notification = req.body;
    
    console.log('🔔 [WEBHOOK ABACATEPAY] Notificação Recebida:', JSON.stringify(notification, null, 2));

    try {
        if (notification.event === 'PAYMENT_APPROVED' && notification.data) {
            const transactionId = notification.data.id;
            const status = notification.data.status;

            if (status === 'APPROVED') {
                await pool.query('BEGIN');
                try {
                    // MUDANÇA DE STATUS: Pending Payment -> Processing
                    const [result] = await pool.execute(
                        "UPDATE orders SET status = 'Processing' WHERE payment_transaction_id = ? AND status = 'Pending Payment'",
                        [transactionId]
                    );
                    if (result.affectedRows > 0) {
                        console.log(`[WEBHOOK] Pedido (ID Transação: ${transactionId}) atualizado para 'Processing'.`);
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


module.exports = router;
