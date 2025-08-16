/**
 * Motor de alertas inteligente para el sistema financiero
 * Maneja diferentes tipos de alertas y notificaciones
 */

const { pool } = require('../database/db');
const { getUserConfig } = require('../database/models');

class AlertEngine {
    constructor() {
        this.alertTypes = {
            BUDGET_WARNING: 'budget_warning',
            BUDGET_EXCEEDED: 'budget_exceeded', 
            CATEGORY_LIMIT: 'category_limit',
            UNUSUAL_SPENDING: 'unusual_spending',
            DAILY_SUMMARY: 'daily_summary',
            WEEKLY_SUMMARY: 'weekly_summary',
            SPENDING_PATTERN: 'spending_pattern'
        };

        this.alertPriorities = {
            LOW: 1,
            MEDIUM: 2,
            HIGH: 3,
            CRITICAL: 4
        };

        // Cache para evitar alertas repetidas
        this.sentAlerts = new Map();
        this.cacheTimeout = 60 * 60 * 1000; // 1 hora
    }

    /**
     * Verifica todos los tipos de alertas para un usuario
     * @param {string} userPhone - Telefono del usuario
     * @param {number} newExpenseAmount - Monto del nuevo gasto (opcional)
     * @param {string} category - Categoria del nuevo gasto (opcional)
     * @returns {Promise<Array>} - Array de alertas generadas
     */
    async checkAllAlerts(userPhone, newExpenseAmount = 0, category = null) {
        try {
            const alerts = [];

            // Verificar alertas de presupuesto
            const budgetAlerts = await this.checkBudgetAlerts(userPhone, newExpenseAmount);
            alerts.push(...budgetAlerts);

            // Verificar alertas de categoria
            if (category && newExpenseAmount > 0) {
                const categoryAlerts = await this.checkCategoryAlerts(userPhone, category, newExpenseAmount);
                alerts.push(...categoryAlerts);
            }

            // Verificar patrones inusuales
            const patternAlerts = await this.checkUnusualSpending(userPhone, newExpenseAmount, category);
            alerts.push(...patternAlerts);

            // Filtrar alertas ya enviadas
            const filteredAlerts = this.filterRecentAlerts(userPhone, alerts);

            // Registrar alertas enviadas
            this.registerSentAlerts(userPhone, filteredAlerts);

            return filteredAlerts;

        } catch (error) {
            console.error('Error verificando alertas:', error);
            return [];
        }
    }

    /**
     * Verifica alertas de presupuesto (diario, semanal, mensual)
     * @param {string} userPhone - Telefono del usuario
     * @param {number} newExpenseAmount - Monto del nuevo gasto
     * @returns {Promise<Array>} - Alertas de presupuesto
     */
    async checkBudgetAlerts(userPhone, newExpenseAmount = 0) {
        try {
            const alerts = [];
            const userConfig = await getUserConfig(userPhone);
            
            const periods = [
                { name: 'diario', limit: userConfig.daily_limit, interval: '1 day' },
                { name: 'semanal', limit: userConfig.weekly_limit, interval: '7 days' },
                { name: 'mensual', limit: userConfig.monthly_limit, interval: '30 days' }
            ];

            for (const period of periods) {
                const spent = await this.getTotalSpent(userPhone, period.interval);
                const projectedSpent = spent + newExpenseAmount;
                const percentage = (projectedSpent / period.limit) * 100;

                // Obtener umbrales de alerta
                const thresholds = Array.isArray(userConfig.alert_thresholds) 
                    ? userConfig.alert_thresholds 
                    : [70, 90];

                // Verificar cada umbral
                for (const threshold of thresholds) {
                    if (percentage >= threshold && percentage < threshold + 10) {
                        alerts.push({
                            type: this.alertTypes.BUDGET_WARNING,
                            priority: percentage >= 90 ? this.alertPriorities.HIGH : this.alertPriorities.MEDIUM,
                            period: period.name,
                            percentage: Math.round(percentage),
                            spent: projectedSpent,
                            limit: period.limit,
                            remaining: Math.max(0, period.limit - projectedSpent),
                            threshold: threshold,
                            message: this.generateBudgetMessage(period.name, percentage, projectedSpent, period.limit)
                        });
                    }
                }

                // Alerta critica si se excede el presupuesto
                if (projectedSpent > period.limit) {
                    alerts.push({
                        type: this.alertTypes.BUDGET_EXCEEDED,
                        priority: this.alertPriorities.CRITICAL,
                        period: period.name,
                        percentage: Math.round(percentage),
                        spent: projectedSpent,
                        limit: period.limit,
                        excess: projectedSpent - period.limit,
                        message: this.generateExceededMessage(period.name, projectedSpent, period.limit)
                    });
                }
            }

            return alerts;

        } catch (error) {
            console.error('Error verificando alertas de presupuesto:', error);
            return [];
        }
    }

    /**
     * Verifica alertas especificas por categoria
     * @param {string} userPhone - Telefono del usuario
     * @param {string} category - Categoria del gasto
     * @param {number} amount - Monto del gasto
     * @returns {Promise<Array>} - Alertas de categoria
     */
    async checkCategoryAlerts(userPhone, category, amount) {
        try {
            const alerts = [];
            
            // Obtener promedio de gastos en esta categoria (ultimos 30 dias)
            const avgQuery = `
                SELECT 
                    AVG(amount) as avg_amount,
                    COUNT(*) as transaction_count,
                    SUM(amount) as total_spent
                FROM transactions 
                WHERE user_phone = $1 
                AND category = $2 
                AND date >= NOW() - INTERVAL '30 days'
            `;

            const result = await pool.query(avgQuery, [userPhone, category]);
            const stats = result.rows[0];

            if (stats.transaction_count > 3) { // Solo si hay suficiente historial
                const avgAmount = parseFloat(stats.avg_amount) || 0;
                const totalSpent = parseFloat(stats.total_spent) || 0;

                // Alerta si el gasto es significativamente mayor al promedio
                if (amount > avgAmount * 2.5) {
                    alerts.push({
                        type: this.alertTypes.UNUSUAL_SPENDING,
                        priority: this.alertPriorities.MEDIUM,
                        category: category,
                        amount: amount,
                        avgAmount: avgAmount,
                        difference: amount - avgAmount,
                        message: `Gasto inusual en ${category}: $${amount} (promedio: $${avgAmount.toFixed(2)})`
                    });
                }

                // Alerta si se excede 150% del gasto mensual tipico en esta categoria
                const monthlyLimit = totalSpent * 1.5;
                const monthlySpent = await this.getCategorySpent(userPhone, category, '30 days');
                
                if (monthlySpent + amount > monthlyLimit) {
                    alerts.push({
                        type: this.alertTypes.CATEGORY_LIMIT,
                        priority: this.alertPriorities.HIGH,
                        category: category,
                        spent: monthlySpent + amount,
                        limit: monthlyLimit,
                        message: `Limite de categoria excedido: ${category} - $${(monthlySpent + amount).toFixed(2)} de $${monthlyLimit.toFixed(2)}`
                    });
                }
            }

            return alerts;

        } catch (error) {
            console.error('Error verificando alertas de categoria:', error);
            return [];
        }
    }

    /**
     * Detecta patrones de gasto inusuales
     * @param {string} userPhone - Telefono del usuario
     * @param {number} amount - Monto del gasto
     * @param {string} category - Categoria del gasto
     * @returns {Promise<Array>} - Alertas de patrones
     */
    async checkUnusualSpending(userPhone, amount, category) {
        try {
            const alerts = [];
            const now = new Date();
            const hour = now.getHours();
            const dayOfWeek = now.getDay();

            // Verificar si es un horario inusual para gastos
            const timeQuery = `
                SELECT COUNT(*) as count
                FROM transactions 
                WHERE user_phone = $1 
                AND EXTRACT(hour FROM date) = $2
                AND date >= NOW() - INTERVAL '60 days'
            `;

            const timeResult = await pool.query(timeQuery, [userPhone, hour]);
            const timeCount = parseInt(timeResult.rows[0].count);

            if (timeCount < 2 && amount > 100) { // Pocas transacciones a esta hora
                alerts.push({
                    type: this.alertTypes.SPENDING_PATTERN,
                    priority: this.alertPriorities.LOW,
                    pattern: 'unusual_time',
                    hour: hour,
                    amount: amount,
                    message: `Gasto inusual a las ${hour}:00 hrs - $${amount}`
                });
            }

            // Verificar multiples gastos en poco tiempo
            const recentQuery = `
                SELECT COUNT(*) as count, SUM(amount) as total
                FROM transactions 
                WHERE user_phone = $1 
                AND date >= NOW() - INTERVAL '2 hours'
            `;

            const recentResult = await pool.query(recentQuery, [userPhone]);
            const recentCount = parseInt(recentResult.rows[0].count);
            const recentTotal = parseFloat(recentResult.rows[0].total) || 0;

            if (recentCount >= 5) { // 5+ gastos en 2 horas
                alerts.push({
                    type: this.alertTypes.SPENDING_PATTERN,
                    priority: this.alertPriorities.MEDIUM,
                    pattern: 'frequent_spending',
                    count: recentCount,
                    total: recentTotal + amount,
                    message: `Gastos frecuentes detectados: ${recentCount} gastos en 2 horas ($${(recentTotal + amount).toFixed(2)})`
                });
            }

            return alerts;

        } catch (error) {
            console.error('Error verificando patrones inusuales:', error);
            return [];
        }
    }

    /**
     * Genera resumen diario automatico
     * @param {string} userPhone - Telefono del usuario
     * @returns {Promise<Object>} - Resumen diario
     */
    async generateDailySummary(userPhone) {
        try {
            const todayQuery = `
                SELECT 
                    COUNT(*) as transaction_count,
                    SUM(amount) as total_spent,
                    category,
                    SUM(amount) as category_total
                FROM transactions 
                WHERE user_phone = $1 
                AND date >= CURRENT_DATE
                GROUP BY category
                ORDER BY category_total DESC
            `;

            const result = await pool.query(todayQuery, [userPhone]);
            const userConfig = await getUserConfig(userPhone);

            const summary = {
                type: this.alertTypes.DAILY_SUMMARY,
                priority: this.alertPriorities.LOW,
                date: new Date().toISOString().split('T')[0],
                totalTransactions: 0,
                totalSpent: 0,
                categories: [],
                dailyProgress: 0,
                message: ''
            };

            for (const row of result.rows) {
                summary.totalTransactions += parseInt(row.transaction_count);
                summary.totalSpent += parseFloat(row.category_total);
                summary.categories.push({
                    name: row.category,
                    amount: parseFloat(row.category_total),
                    transactions: parseInt(row.transaction_count)
                });
            }

            summary.dailyProgress = (summary.totalSpent / userConfig.daily_limit) * 100;
            summary.message = this.generateDailySummaryMessage(summary, userConfig.daily_limit);

            return summary;

        } catch (error) {
            console.error('Error generando resumen diario:', error);
            return null;
        }
    }

    /**
     * Obtiene total gastado en un periodo
     * @param {string} userPhone - Telefono del usuario
     * @param {string} interval - Intervalo de tiempo
     * @returns {Promise<number>} - Total gastado
     */
    async getTotalSpent(userPhone, interval) {
        try {
            const query = `
                SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions 
                WHERE user_phone = $1 
                AND date >= NOW() - INTERVAL '${interval}'
            `;

            const result = await pool.query(query, [userPhone]);
            return parseFloat(result.rows[0].total) || 0;

        } catch (error) {
            console.error('Error obteniendo total gastado:', error);
            return 0;
        }
    }

    /**
     * Obtiene total gastado en una categoria
     * @param {string} userPhone - Telefono del usuario
     * @param {string} category - Categoria
     * @param {string} interval - Intervalo de tiempo
     * @returns {Promise<number>} - Total gastado en categoria
     */
    async getCategorySpent(userPhone, category, interval) {
        try {
            const query = `
                SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions 
                WHERE user_phone = $1 
                AND category = $2
                AND date >= NOW() - INTERVAL '${interval}'
            `;

            const result = await pool.query(query, [userPhone, category]);
            return parseFloat(result.rows[0].total) || 0;

        } catch (error) {
            console.error('Error obteniendo gasto por categoria:', error);
            return 0;
        }
    }

    /**
     * Filtra alertas enviadas recientemente
     * @param {string} userPhone - Telefono del usuario
     * @param {Array} alerts - Alertas a filtrar
     * @returns {Array} - Alertas filtradas
     */
    filterRecentAlerts(userPhone, alerts) {
        const userKey = `alerts_${userPhone}`;
        const sentAlerts = this.sentAlerts.get(userKey) || [];
        const now = Date.now();

        // Limpiar alertas expiradas
        const validSentAlerts = sentAlerts.filter(alert => 
            now - alert.timestamp < this.cacheTimeout
        );

        // Filtrar alertas duplicadas
        const filteredAlerts = alerts.filter(alert => {
            const alertKey = `${alert.type}_${alert.period || alert.category || 'general'}`;
            return !validSentAlerts.some(sent => sent.key === alertKey);
        });

        // Actualizar cache
        this.sentAlerts.set(userKey, validSentAlerts);

        return filteredAlerts;
    }

    /**
     * Registra alertas enviadas
     * @param {string} userPhone - Telefono del usuario
     * @param {Array} alerts - Alertas enviadas
     */
    registerSentAlerts(userPhone, alerts) {
        const userKey = `alerts_${userPhone}`;
        const sentAlerts = this.sentAlerts.get(userKey) || [];
        const now = Date.now();

        for (const alert of alerts) {
            const alertKey = `${alert.type}_${alert.period || alert.category || 'general'}`;
            sentAlerts.push({
                key: alertKey,
                timestamp: now
            });
        }

        this.sentAlerts.set(userKey, sentAlerts);
    }

    // Generadores de mensajes

    generateBudgetMessage(period, percentage, spent, limit) {
        return `*ALERTA ${period.toUpperCase()}*\nHas gastado el ${percentage}% de tu presupuesto\n$${spent.toFixed(2)} de $${limit} disponible\nRestante: $${(limit - spent).toFixed(2)}`;
    }

    generateExceededMessage(period, spent, limit) {
        const excess = spent - limit;
        return `*PRESUPUESTO ${period.toUpperCase()} EXCEDIDO*\nGastado: $${spent.toFixed(2)}\nLimite: $${limit}\nExceso: $${excess.toFixed(2)}`;
    }

    generateDailySummaryMessage(summary, dailyLimit) {
        let message = `*RESUMEN DEL DIA*\n\n`;
        message += `Transacciones: ${summary.totalTransactions}\n`;
        message += `Total gastado: $${summary.totalSpent.toFixed(2)}\n`;
        message += `Progreso diario: ${summary.dailyProgress.toFixed(1)}%\n\n`;
        
        if (summary.categories.length > 0) {
            message += `*Por categoria:*\n`;
            summary.categories.slice(0, 3).forEach(cat => {
                message += `- ${cat.name}: $${cat.amount.toFixed(2)}\n`;
            });
        }

        return message;
    }

    /**
     * Programa alertas automaticas (para uso con cron jobs)
     * @param {string} userPhone - Telefono del usuario
     * @returns {Promise<Array>} - Alertas programadas
     */
    async getScheduledAlerts(userPhone) {
        const now = new Date();
        const hour = now.getHours();
        const alerts = [];

        // Resumen diario a las 20:00
        if (hour === 20) {
            const dailySummary = await this.generateDailySummary(userPhone);
            if (dailySummary && dailySummary.totalTransactions > 0) {
                alerts.push(dailySummary);
            }
        }

        return alerts;
    }
}

// Crear instancia singleton
const alertEngine = new AlertEngine();

// Exportar funciones principales
module.exports = {
    AlertEngine,
    checkAllAlerts: (userPhone, amount, category) => alertEngine.checkAllAlerts(userPhone, amount, category),
    checkBudgetAlerts: (userPhone, amount) => alertEngine.checkBudgetAlerts(userPhone, amount),
    checkCategoryAlerts: (userPhone, category, amount) => alertEngine.checkCategoryAlerts(userPhone, category, amount),
    generateDailySummary: (userPhone) => alertEngine.generateDailySummary(userPhone),
    getScheduledAlerts: (userPhone) => alertEngine.getScheduledAlerts(userPhone),
    alertTypes: alertEngine.alertTypes,
    alertPriorities: alertEngine.alertPriorities
};