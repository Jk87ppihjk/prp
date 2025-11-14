// ! Arquivo: trackingAndDataRoutes.js (Rotas 8, 10, 11, 13)

const express = require('express');
const router = express.Router();
const pool = require('./config/db');
const { protectSeller } = require('./sellerAuthMiddleware'); 
const { protectDeliveryPerson } = require('./deliveryAuthMiddleware');
const { protect } = require('./authMiddleware'); 

// Importa o serviço de tracking e métricas
const { 
    getBuyerTrackingMessage, 
    getSellerMetrics, 
    getDeliveryPersonMetrics 
} = require('./trackingService'); 

// --- Constantes Comuns ---
const MARKETPLACE_FEE_RATE = 0.05; // 5%
const DELIVERY_FEE = 5.00;         // R$ 5,00


// ===================================================================
// ROTAS DE LISTAGEM DE PEDIDOS
// ===================================================================

/**
 * Rota 10: Listar Pedidos da Loja (GET /api/delivery/orders/store/:storeId)
 * USADA PELO painel.html
 */
router.get('/orders/store/:storeId', protectSeller, async (req, res) => {
    const storeId = req.params.storeId;
    const sellerId = req.user.id;

    const [storeCheck] = await pool.execute('SELECT seller_id FROM stores WHERE id = ? AND seller_id = ?', [storeId, sellerId]);
    
    if (storeCheck.length === 0) {
        return res.status(403).json({ success: false, message: 'Acesso negado. Esta loja não pertence a você.' });
    }

    try {
        const [orders] = await pool.execute(
            `SELECT 
                o.id, o.total_amount, o.status, o.delivery_method, o.created_at, o.delivery_code, o.delivery_pickup_code,
                u.full_name AS buyer_name,
                dp.full_name AS delivery_person_name
             FROM orders o
             JOIN users u ON o.buyer_id = u.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             LEFT JOIN users dp ON d.delivery_person_id = dp.id
             WHERE o.store_id = ?
             ORDER BY o.created_at DESC`,
            [storeId]
        );
        
        res.status(200).json({ success: true, orders: orders });

    } catch (error) {
        console.error('[DELIVERY/STORE_ORDERS] Erro ao listar pedidos da loja:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar pedidos.' });
    }
});


/**
 * Rota 11: Comprador lista seus pedidos (GET /api/delivery/orders/mine)
 * USADA PELO my_orders.html
 */
router.get('/orders/mine', protect, async (req, res) => {
    const buyerId = req.user.id; 

    try {
        // Junta dados de pedidos e dados de entrega para o rastreamento
        const [orders] = await pool.execute(
            `SELECT 
                o.id, o.total_amount, o.status, o.delivery_method, o.created_at, o.delivery_code, o.delivery_pickup_code,
                s.name AS store_name,
                d.status AS delivery_status,
                d.packing_start_time, d.pickup_time,
                dp.full_name AS delivery_person_name
             FROM orders o
             JOIN stores s ON o.store_id = s.id
             LEFT JOIN deliveries d ON o.id = d.order_id
             LEFT JOIN users dp ON d.delivery_person_id = dp.id
             WHERE o.buyer_id = ?
             ORDER BY o.created_at DESC`,
            [buyerId]
        );

        // Gera a mensagem de rastreamento detalhada para cada pedido
        const ordersWithTracking = orders.map(order => {
            const trackingMessage = getBuyerTrackingMessage(order, order);

            return {
                ...order,
                tracking_message: trackingMessage
            };
        });

        res.status(200).json({ success: true, orders: ordersWithTracking });

    } catch (error) {
        console.error('[DELIVERY/BUYER_ORDERS] Erro ao listar pedidos do comprador:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao carregar pedidos.' });
    }
});


// ===================================================================
// ROTAS DE STATUS E MÉTRICAS
// ===================================================================

/**
 * Rota 8: Checar Status do Pedido (para Polling)
 * Retorna status e a mensagem de rastreamento detalhada.
 */
router.get('/orders/:orderId/status', protect, async (req, res) => {
    const orderId = req.params.orderId;
    const buyerId = req.user.id;

    try {
        // Busca pedidos e dados de entrega para o tracking
        const [orderRows] = await pool.execute(
            `SELECT o.status, o.delivery_code, d.delivery_person_id, d.packing_start_time, d.pickup_time
             FROM orders o
             LEFT JOIN deliveries d ON o.id = d.order_id
             WHERE o.id = ? AND o.buyer_id = ?`,
            [orderId, buyerId]
        );

        const order = orderRows[0];

        if (!order) {
            return res.status(404).json({ success: false, message: 'Pedido não encontrado ou não pertence a você.' });
        }

        // NOVO: Gera a mensagem detalhada de rastreamento
        const trackingMessage = getBuyerTrackingMessage(order, order);

        res.status(200).json({ 
            success: true, 
            status: order.status, 
            delivery_code: order.delivery_code,
            tracking_message: trackingMessage
        });

    } catch (error) {
        console.error('[STATUS] Erro ao checar status do pedido:', error.message);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    }
});


/**
 * Rota 13: Obter Saldo e Métricas do Vendedor (GET /api/delivery/users/seller/metrics)
 */
router.get('/users/seller/metrics', protectSeller, async (req, res) => {
    const sellerId = req.user.id; 

    try {
        const [userRows] = await pool.execute(
            "SELECT pending_balance, total_delivered_orders FROM users WHERE id = ?", 
            [sellerId]
        );
        const user = userRows[0];
        
        const metrics = await getSellerMetrics(sellerId);
        
        res.status(200).json({
            success: true,
            balance: {
                pending_balance: user.pending_balance || 0,
            },
            financial_info: {
                marketplace_fee_rate: MARKETPLACE_FEE_RATE * 100,
                delivery_fee_paid_by_marketplace: DELIVERY_FEE,
                pricing_note: "Lembrete: o Marketplace adiciona R$10,00 no preço final para auxiliar na cobertura da taxa de serviço (5%) e da taxa de entrega (R$5,00) se for via Marketplace.",
            },
            metrics: metrics
        });

    } catch (error) {
        console.error('[METRICS/SELLER] Erro ao obter métricas do vendedor:', error.message);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar métricas.' });
    }
});


module.exports = router;
