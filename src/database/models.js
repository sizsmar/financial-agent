const { pool } = require('./db');
const { categorizeExpense } = require('../services/categorizer');
const { checkAllAlerts } = require('../services/alerts');

// Crear una nueva transacci�n
async function createTransaction(userPhone, amount, description, category = null, source = 'manual', rawData = null) {
    try {
        const categorizedCategory = category || await categorizeExpense(description, userPhone);
        
        const query = `
            INSERT INTO transactions (user_phone, amount, description, category, source, raw_data)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        
        const values = [userPhone, amount, description, categorizedCategory, source, rawData];
        const result = await pool.query(query, values);
        
        // Verificar alertas después de crear la transacción
        const alerts = await checkAllAlerts(userPhone, amount, categorizedCategory);
        
        // Agregar alertas al resultado
        const transaction = result.rows[0];
        transaction.alerts = alerts;
        
        return transaction;
    } catch (error) {
        console.error('Error creating transaction:', error);
        throw error;
    }
}

// Obtener transacciones por usuario con filtro de fecha opcional
async function getTransactionsByUser(userPhone, dateRange = null) {
    try {
        let query = `
            SELECT * FROM transactions 
            WHERE user_phone = $1
        `;
        let values = [userPhone];
        
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            query += ` AND date BETWEEN $2 AND $3`;
            values.push(dateRange.startDate, dateRange.endDate);
        }
        
        query += ` ORDER BY date DESC`;
        
        const result = await pool.query(query, values);
        return result.rows;
    } catch (error) {
        console.error('Error getting transactions by user:', error);
        throw error;
    }
}

// Obtener total gastado por per�odo
async function getTotalSpentByPeriod(userPhone, period = 'day') {
    try {
        let dateCondition;
        
        switch (period.toLowerCase()) {
            case 'day':
                dateCondition = "date >= CURRENT_DATE";
                break;
            case 'week':
                dateCondition = "date >= CURRENT_DATE - INTERVAL '7 days'";
                break;
            case 'month':
                dateCondition = "date >= CURRENT_DATE - INTERVAL '30 days'";
                break;
            default:
                dateCondition = "date >= CURRENT_DATE";
        }
        
        const query = `
            SELECT 
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as transaction_count,
                category,
                SUM(amount) as category_total
            FROM transactions 
            WHERE user_phone = $1 AND ${dateCondition}
            GROUP BY category
            ORDER BY category_total DESC
        `;
        
        const totalQuery = `
            SELECT COALESCE(SUM(amount), 0) as total_spent
            FROM transactions 
            WHERE user_phone = $1 AND ${dateCondition}
        `;
        
        const [categoryResult, totalResult] = await Promise.all([
            pool.query(query, [userPhone]),
            pool.query(totalQuery, [userPhone])
        ]);
        
        return {
            totalSpent: parseFloat(totalResult.rows[0].total_spent),
            byCategory: categoryResult.rows.map(row => ({
                category: row.category,
                total: parseFloat(row.category_total),
                transactionCount: parseInt(row.transaction_count)
            })),
            period: period
        };
    } catch (error) {
        console.error('Error getting total spent by period:', error);
        throw error;
    }
}

// Obtener configuraci�n de usuario
async function getUserConfig(userPhone) {
    try {
        const query = `
            SELECT * FROM user_config 
            WHERE user_phone = $1
        `;
        
        const result = await pool.query(query, [userPhone]);
        
        if (result.rows.length === 0) {
            // Si no existe configuraci�n, crear una por defecto
            return await createDefaultUserConfig(userPhone);
        }
        
        return result.rows[0];
    } catch (error) {
        console.error('Error getting user config:', error);
        throw error;
    }
}

// Crear configuraci�n por defecto para un usuario
async function createDefaultUserConfig(userPhone) {
    try {
        const query = `
            INSERT INTO user_config (user_phone)
            VALUES ($1)
            RETURNING *
        `;
        
        const result = await pool.query(query, [userPhone]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating default user config:', error);
        throw error;
    }
}

// Actualizar configuraci�n de usuario
async function updateUserConfig(userPhone, config) {
    try {
        const allowedFields = ['daily_limit', 'weekly_limit', 'monthly_limit', 'alert_thresholds', 'timezone'];
        const updates = [];
        const values = [];
        let paramCounter = 1;
        
        for (const [key, value] of Object.entries(config)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = $${paramCounter}`);
                values.push(value);
                paramCounter++;
            }
        }
        
        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }
        
        values.push(userPhone);
        
        const query = `
            UPDATE user_config 
            SET ${updates.join(', ')}, updadet_at = NOW()
            WHERE user_phone = $${paramCounter}
            RETURNING *
        `;
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            // Si no existe el usuario, crear configuraci�n primero
            await createDefaultUserConfig(userPhone);
            return await updateUserConfig(userPhone, config);
        }
        
        return result.rows[0];
    } catch (error) {
        console.error('Error updating user config:', error);
        throw error;
    }
}

// Obtener todas las categor�as
async function getCategories() {
    try {
        const query = `
            SELECT * FROM categories 
            ORDER BY name
        `;
        
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error getting categories:', error);
        throw error;
    }
}

// Categorizar por keywords
async function categorizeByKeywords(description) {
    try {
        if (!description || description.trim() === '') {
            return 'otros';
        }
        
        const normalizedDescription = description.toLowerCase().trim();
        
        const query = `
            SELECT name, keywords FROM categories 
            WHERE name != 'otros'
            ORDER BY name
        `;
        
        const result = await pool.query(query);
        const categories = result.rows;
        
        // Buscar coincidencias en keywords
        for (const category of categories) {
            const keywords = category.keywords || [];
            
            for (const keyword of keywords) {
                if (normalizedDescription.includes(keyword.toLowerCase())) {
                    return category.name;
                }
            }
        }
        
        // Si no se encuentra ninguna coincidencia, retornar 'otros'
        return 'otros';
    } catch (error) {
        console.error('Error categorizing by keywords:', error);
        return 'otros'; // Default category en caso de error
    }
}

// Funci�n auxiliar para obtener estad�sticas de gastos
async function getSpendingStats(userPhone, period = 'month') {
    try {
        const totalData = await getTotalSpentByPeriod(userPhone, period);
        const userConfig = await getUserConfig(userPhone);
        
        let limit;
        switch (period.toLowerCase()) {
            case 'day':
                limit = parseFloat(userConfig.daily_limit);
                break;
            case 'week':
                limit = parseFloat(userConfig.weekly_limit);
                break;
            case 'month':
                limit = parseFloat(userConfig.monthly_limit);
                break;
            default:
                limit = parseFloat(userConfig.monthly_limit);
        }
        
        const percentage = limit > 0 ? (totalData.totalSpent / limit) * 100 : 0;
        
        return {
            ...totalData,
            limit: limit,
            percentage: Math.round(percentage * 100) / 100,
            remainingBudget: Math.max(0, limit - totalData.totalSpent)
        };
    } catch (error) {
        console.error('Error getting spending stats:', error);
        throw error;
    }
}

// Funci�n auxiliar para verificar si se debe enviar alerta
async function shouldSendAlert(userPhone, period = 'day') {
    try {
        const stats = await getSpendingStats(userPhone, period);
        const userConfig = await getUserConfig(userPhone);
        
        const thresholds = Array.isArray(userConfig.alert_thresholds) 
            ? userConfig.alert_thresholds 
            : [70, 90]; // Default thresholds
        
        const alertLevel = thresholds.find(threshold => 
            stats.percentage >= threshold && stats.percentage < (threshold + 10)
        );
        
        return alertLevel ? {
            shouldAlert: true,
            alertLevel: alertLevel,
            stats: stats
        } : {
            shouldAlert: false,
            stats: stats
        };
    } catch (error) {
        console.error('Error checking alert conditions:', error);
        return { shouldAlert: false, error: error.message };
    }
}

module.exports = {
    createTransaction,
    getTransactionsByUser,
    getTotalSpentByPeriod,
    getUserConfig,
    updateUserConfig,
    getCategories,
    categorizeByKeywords,
    createDefaultUserConfig,
    getSpendingStats,
    shouldSendAlert
};