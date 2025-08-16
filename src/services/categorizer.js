/**
 * Motor de categorizacion inteligente para gastos
 * Maneja keywords, aprendizaje y patrones de gasto
 */

const { pool } = require('../database/db');

class ExpenseCategorizer {
    constructor() {
        this.categoriesCache = null;
        this.cacheExpiration = null;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutos

        // Keywords adicionales por contexto
        this.contextKeywords = {
            brands: {
                'comida': ['mcdonalds', 'kfc', 'subway', 'dominos', 'starbucks', 'oxxo'],
                'transporte': ['pemex', 'shell', 'bp', 'mobil'],
                'entretenimiento': ['netflix', 'spotify', 'amazon prime', 'disney'],
                'compras': ['amazon', 'mercadolibre', 'liverpool', 'palacio'],
                'servicios': ['telmex', 'izzi', 'totalplay', 'telcel']
            },
            locations: {
                'comida': ['restaurante', 'cocina', 'bar', 'cafe', 'cafeteria'],
                'transporte': ['gasolinera', 'estacion', 'terminal', 'aeropuerto'],
                'entretenimiento': ['cine', 'teatro', 'estadio', 'parque'],
                'compras': ['tienda', 'mall', 'plaza', 'centro comercial'],
                'salud': ['hospital', 'clinica', 'farmacia', 'consultorio']
            },
            actions: {
                'comida': ['comer', 'almorzar', 'cenar', 'desayunar', 'merendar'],
                'transporte': ['viajar', 'manejar', 'conducir', 'transportar'],
                'entretenimiento': ['divertir', 'jugar', 'ver', 'escuchar'],
                'compras': ['comprar', 'adquirir', 'conseguir'],
                'salud': ['curar', 'medicar', 'consultar', 'tratar']
            }
        };

        // Pesos para diferentes tipos de matches
        this.matchWeights = {
            exact: 10,
            brand: 8,
            location: 6,
            action: 4,
            keyword: 5,
            partial: 2
        };
    }

    /**
     * Categoriza un gasto basado en la descripcion
     * @param {string} description - Descripcion del gasto
     * @param {string} userPhone - Telefono del usuario para aprendizaje
     * @returns {Promise<string>} - Categoria detectada
     */
    async categorizeExpense(description, userPhone = null) {
        try {
            if (!description || typeof description !== 'string') {
                return 'otros';
            }

            // Obtener categorias disponibles
            const categories = await this.getCategories();
            
            // Normalizar descripcion
            const normalizedDesc = this.normalizeDescription(description);
            
            // Calcular scores para cada categoria
            const categoryScores = await this.calculateCategoryScores(normalizedDesc, categories, userPhone);
            
            // Seleccionar mejor categoria
            const bestCategory = this.selectBestCategory(categoryScores);
            
            // Aprender de este gasto si hay usuario
            if (userPhone && bestCategory !== 'otros') {
                await this.learnFromExpense(userPhone, normalizedDesc, bestCategory);
            }

            return bestCategory;

        } catch (error) {
            console.error('Error categorizando gasto:', error);
            return 'otros';
        }
    }

    /**
     * Obtiene categorias desde base de datos con cache
     * @returns {Promise<Array>} - Array de categorias
     */
    async getCategories() {
        try {
            // Verificar cache
            if (this.categoriesCache && this.cacheExpiration && Date.now() < this.cacheExpiration) {
                return this.categoriesCache;
            }

            const query = 'SELECT * FROM categories ORDER BY name';
            const result = await pool.query(query);
            
            // Actualizar cache
            this.categoriesCache = result.rows;
            this.cacheExpiration = Date.now() + this.cacheTimeout;
            
            return result.rows;

        } catch (error) {
            console.error('Error obteniendo categorias:', error);
            return [];
        }
    }

    /**
     * Normaliza la descripcion para mejorar matching
     * @param {string} description - Descripcion original
     * @returns {string} - Descripcion normalizada
     */
    normalizeDescription(description) {
        return description
            .toLowerCase()
            .trim()
            // Normalizar acentos
            .replace(/[áàä]/g, 'a')
            .replace(/[éèë]/g, 'e')
            .replace(/[íìï]/g, 'i')
            .replace(/[óòö]/g, 'o')
            .replace(/[úùü]/g, 'u')
            .replace(/ñ/g, 'n')
            // Remover caracteres especiales excepto espacios
            .replace(/[^a-z0-9\s]/g, ' ')
            // Normalizar espacios
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Calcula scores para cada categoria
     * @param {string} description - Descripcion normalizada
     * @param {Array} categories - Array de categorias
     * @param {string} userPhone - Telefono del usuario
     * @returns {Promise<Object>} - Scores por categoria
     */
    async calculateCategoryScores(description, categories, userPhone) {
        const scores = {};

        for (const category of categories) {
            scores[category.name] = 0;

            // Score por keywords directas
            if (category.keywords && Array.isArray(category.keywords)) {
                scores[category.name] += this.calculateKeywordScore(description, category.keywords);
            }

            // Score por keywords contextuales
            scores[category.name] += this.calculateContextScore(description, category.name);

            // Score por aprendizaje del usuario
            if (userPhone) {
                scores[category.name] += await this.calculateUserLearningScore(description, category.name, userPhone);
            }
        }

        return scores;
    }

    /**
     * Calcula score basado en keywords directas
     * @param {string} description - Descripcion
     * @param {Array} keywords - Keywords de la categoria
     * @returns {number} - Score calculado
     */
    calculateKeywordScore(description, keywords) {
        let score = 0;
        const words = description.split(' ');

        for (const keyword of keywords) {
            const normalizedKeyword = keyword.toLowerCase();
            
            // Match exacto
            if (description.includes(normalizedKeyword)) {
                score += this.matchWeights.exact;
            }
            
            // Match parcial en palabras
            for (const word of words) {
                if (word.includes(normalizedKeyword) || normalizedKeyword.includes(word)) {
                    score += this.matchWeights.partial;
                }
            }
        }

        return score;
    }

    /**
     * Calcula score basado en contexto (marcas, lugares, acciones)
     * @param {string} description - Descripcion
     * @param {string} categoryName - Nombre de la categoria
     * @returns {number} - Score contextual
     */
    calculateContextScore(description, categoryName) {
        let score = 0;

        // Verificar marcas
        if (this.contextKeywords.brands[categoryName]) {
            for (const brand of this.contextKeywords.brands[categoryName]) {
                if (description.includes(brand.toLowerCase())) {
                    score += this.matchWeights.brand;
                }
            }
        }

        // Verificar lugares
        if (this.contextKeywords.locations[categoryName]) {
            for (const location of this.contextKeywords.locations[categoryName]) {
                if (description.includes(location.toLowerCase())) {
                    score += this.matchWeights.location;
                }
            }
        }

        // Verificar acciones
        if (this.contextKeywords.actions[categoryName]) {
            for (const action of this.contextKeywords.actions[categoryName]) {
                if (description.includes(action.toLowerCase())) {
                    score += this.matchWeights.action;
                }
            }
        }

        return score;
    }

    /**
     * Calcula score basado en aprendizaje del usuario
     * @param {string} description - Descripcion
     * @param {string} categoryName - Nombre de la categoria
     * @param {string} userPhone - Telefono del usuario
     * @returns {Promise<number>} - Score de aprendizaje
     */
    async calculateUserLearningScore(description, categoryName, userPhone) {
        try {
            // Buscar gastos similares del usuario en esta categoria
            const query = `
                SELECT description, COUNT(*) as frequency
                FROM transactions 
                WHERE user_phone = $1 AND category = $2
                AND date >= NOW() - INTERVAL '90 days'
                GROUP BY description
                ORDER BY frequency DESC
                LIMIT 20
            `;
            
            const result = await pool.query(query, [userPhone, categoryName]);
            let score = 0;

            for (const row of result.rows) {
                const similarity = this.calculateSimilarity(description, row.description.toLowerCase());
                if (similarity > 0.5) {
                    score += row.frequency * similarity * 2;
                }
            }

            return Math.min(score, 20); // Cap maximo

        } catch (error) {
            console.error('Error calculando score de aprendizaje:', error);
            return 0;
        }
    }

    /**
     * Calcula similitud entre dos textos
     * @param {string} text1 - Primer texto
     * @param {string} text2 - Segundo texto
     * @returns {number} - Similitud entre 0 y 1
     */
    calculateSimilarity(text1, text2) {
        const words1 = new Set(text1.split(' '));
        const words2 = new Set(text2.split(' '));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        return intersection.size / union.size;
    }

    /**
     * Selecciona la mejor categoria basada en scores
     * @param {Object} scores - Scores por categoria
     * @returns {string} - Mejor categoria
     */
    selectBestCategory(scores) {
        let bestCategory = 'otros';
        let maxScore = 0;

        for (const [category, score] of Object.entries(scores)) {
            if (score > maxScore && score > 2) { // Threshold minimo
                maxScore = score;
                bestCategory = category;
            }
        }

        return bestCategory;
    }

    /**
     * Aprende de un gasto para mejorar futuras categorizaciones
     * @param {string} userPhone - Telefono del usuario
     * @param {string} description - Descripcion del gasto
     * @param {string} category - Categoria asignada
     */
    async learnFromExpense(userPhone, description, category) {
        try {
            // Extraer palabras clave de la descripcion
            const words = description.split(' ').filter(word => word.length > 2);
            
            // Buscar palabras que aparecen frecuentemente en esta categoria para este usuario
            for (const word of words) {
                const query = `
                    SELECT COUNT(*) as frequency
                    FROM transactions 
                    WHERE user_phone = $1 
                    AND category = $2 
                    AND LOWER(description) LIKE $3
                    AND date >= NOW() - INTERVAL '30 days'
                `;
                
                const result = await pool.query(query, [userPhone, category, `%${word}%`]);
                const frequency = parseInt(result.rows[0].frequency);
                
                // Si la palabra aparece 3+ veces, considerar agregarla como keyword
                if (frequency >= 3) {
                    await this.addUserKeyword(userPhone, category, word);
                }
            }

        } catch (error) {
            console.error('Error en aprendizaje:', error);
        }
    }

    /**
     * Agrega keyword personalizada para un usuario (simulado)
     * @param {string} userPhone - Telefono del usuario
     * @param {string} category - Categoria
     * @param {string} keyword - Keyword a agregar
     */
    async addUserKeyword(userPhone, category, keyword) {
        // En un sistema real, esto se guardaria en una tabla user_keywords
        // Por ahora solo registramos en logs
        console.log(`Aprendizaje: Usuario ${userPhone} - "${keyword}" asociado con ${category}`);
    }

    /**
     * Analiza patrones de gasto del usuario
     * @param {string} userPhone - Telefono del usuario
     * @param {number} days - Dias a analizar (default: 30)
     * @returns {Promise<Object>} - Analisis de patrones
     */
    async analyzeSpendingPatterns(userPhone, days = 30) {
        try {
            const query = `
                SELECT 
                    category,
                    COUNT(*) as transaction_count,
                    SUM(amount) as total_amount,
                    AVG(amount) as avg_amount,
                    MIN(amount) as min_amount,
                    MAX(amount) as max_amount,
                    EXTRACT(hour FROM date) as hour_of_day
                FROM transactions 
                WHERE user_phone = $1 
                AND date >= NOW() - INTERVAL '${days} days'
                GROUP BY category, EXTRACT(hour FROM date)
                ORDER BY total_amount DESC
            `;

            const result = await pool.query(query, [userPhone]);
            
            // Procesar datos
            const patterns = {
                by_category: {},
                by_time: {},
                total_transactions: 0,
                total_amount: 0
            };

            for (const row of result.rows) {
                const category = row.category;
                const hour = parseInt(row.hour_of_day);

                // Agregar a patrones por categoria
                if (!patterns.by_category[category]) {
                    patterns.by_category[category] = {
                        count: 0,
                        total: 0,
                        avg: 0,
                        min: Infinity,
                        max: 0
                    };
                }

                patterns.by_category[category].count += parseInt(row.transaction_count);
                patterns.by_category[category].total += parseFloat(row.total_amount);
                patterns.by_category[category].avg = patterns.by_category[category].total / patterns.by_category[category].count;
                patterns.by_category[category].min = Math.min(patterns.by_category[category].min, parseFloat(row.min_amount));
                patterns.by_category[category].max = Math.max(patterns.by_category[category].max, parseFloat(row.max_amount));

                // Agregar a patrones por hora
                if (!patterns.by_time[hour]) {
                    patterns.by_time[hour] = { count: 0, amount: 0 };
                }
                patterns.by_time[hour].count += parseInt(row.transaction_count);
                patterns.by_time[hour].amount += parseFloat(row.total_amount);

                patterns.total_transactions += parseInt(row.transaction_count);
                patterns.total_amount += parseFloat(row.total_amount);
            }

            return patterns;

        } catch (error) {
            console.error('Error analizando patrones:', error);
            return null;
        }
    }

    /**
     * Sugiere optimizaciones basadas en patrones
     * @param {string} userPhone - Telefono del usuario
     * @returns {Promise<Array>} - Array de sugerencias
     */
    async getSuggestions(userPhone) {
        try {
            const patterns = await this.analyzeSpendingPatterns(userPhone);
            if (!patterns) return [];

            const suggestions = [];

            // Sugerencia por categoria mas gastada
            const topCategory = Object.entries(patterns.by_category)
                .sort(([,a], [,b]) => b.total - a.total)[0];

            if (topCategory) {
                suggestions.push({
                    type: 'category_alert',
                    message: `Tu categoria de mayor gasto es "${topCategory[0]}" con $${topCategory[1].total.toFixed(2)}`,
                    category: topCategory[0],
                    amount: topCategory[1].total
                });
            }

            // Sugerencia por horarios de gasto
            const topHour = Object.entries(patterns.by_time)
                .sort(([,a], [,b]) => b.amount - a.amount)[0];

            if (topHour) {
                suggestions.push({
                    type: 'time_alert',
                    message: `Gastas mas a las ${topHour[0]}:00 hrs ($${topHour[1].amount.toFixed(2)})`,
                    hour: parseInt(topHour[0]),
                    amount: topHour[1].amount
                });
            }

            return suggestions;

        } catch (error) {
            console.error('Error generando sugerencias:', error);
            return [];
        }
    }

    /**
     * Limpia cache de categorias
     */
    clearCache() {
        this.categoriesCache = null;
        this.cacheExpiration = null;
    }

    /**
     * Actualiza keywords de una categoria
     * @param {string} categoryName - Nombre de la categoria
     * @param {Array} newKeywords - Nuevas keywords
     * @returns {Promise<boolean>} - Exito de la operacion
     */
    async updateCategoryKeywords(categoryName, newKeywords) {
        try {
            const query = `
                UPDATE categories 
                SET keywords = $1 
                WHERE name = $2
            `;
            
            await pool.query(query, [newKeywords, categoryName]);
            this.clearCache(); // Limpiar cache
            
            return true;

        } catch (error) {
            console.error('Error actualizando keywords:', error);
            return false;
        }
    }
}

// Crear instancia singleton
const categorizer = new ExpenseCategorizer();

// Exportar funciones principales
module.exports = {
    ExpenseCategorizer,
    categorizeExpense: (description, userPhone) => categorizer.categorizeExpense(description, userPhone),
    analyzeSpendingPatterns: (userPhone, days) => categorizer.analyzeSpendingPatterns(userPhone, days),
    getSuggestions: (userPhone) => categorizer.getSuggestions(userPhone),
    updateCategoryKeywords: (category, keywords) => categorizer.updateCategoryKeywords(category, keywords),
    getCategories: () => categorizer.getCategories()
};