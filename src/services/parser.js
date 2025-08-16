/**
 * Parser de mensajes para extraer informacion de gastos
 * Maneja diferentes formatos de texto libre para registrar gastos
 */

class MessageParser {
    constructor() {
        // Palabras clave para acciones de gasto
        this.expenseKeywords = [
            'gaste', 'gasto', 'gastamos', 'gastaron',
            'compre', 'compro', 'compramos', 'compraron',
            'pague', 'pago', 'pagamos', 'pagaron',
            'di', 'dio', 'dimos', 'dieron',
            'invirti', 'invirtio', 'invertimos', 'invirtieron',
            'costo', 'cuesta', 'vale', 'precio'
        ];

        // Conectores comunes
        this.connectors = ['en', 'de', 'por', 'para', 'con', 'del', 'al'];

        // Simbolos de moneda
        this.currencySymbols = ['$', 'pesos', 'peso', 'mx', 'mxn'];

        // Patrones de regex para diferentes formatos
        this.patterns = this.initializePatterns();
    }

    initializePatterns() {
        return [
            // Patron 1: "gaste $300 en tacos"
            {
                name: 'action_amount_connector_description',
                regex: /(?:gaste|gasto|compre|compro|pague|pago|di|dio|costo|cuesta)\s*\$?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?\s*(?:en|de|por|para|con)\s*(.+)/i,
                amountIndex: 1,
                descriptionIndex: 2
            },
            
            // Patron 2: "compre gasolina por $200"
            {
                name: 'action_description_connector_amount',
                regex: /(?:gaste|gasto|compre|compro|pague|pago|di|dio)\s+(.+?)\s+(?:por|en|de|a)\s*\$?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?/i,
                amountIndex: 2,
                descriptionIndex: 1
            },

            // Patron 3: "$300 en tacos" o "$300 de gasolina"
            {
                name: 'amount_connector_description',
                regex: /\$?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?\s*(?:en|de|por|para)\s*(.+)/i,
                amountIndex: 1,
                descriptionIndex: 2
            },

            // Patron 4: "tacos $45" o "gasolina $200"
            {
                name: 'description_amount',
                regex: /(.+?)\s*\$?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?$/i,
                amountIndex: 2,
                descriptionIndex: 1
            },

            // Patron 5: "pague 200 la renta"
            {
                name: 'action_amount_description',
                regex: /(?:gaste|gasto|compre|compro|pague|pago|di|dio)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?\s*(.+)/i,
                amountIndex: 1,
                descriptionIndex: 2
            },

            // Patron 6: Solo numeros con simbolo "$300" 
            {
                name: 'amount_only',
                regex: /^\$?(\d+(?:[.,]\d{1,2})?)\s*(?:pesos?)?$/i,
                amountIndex: 1,
                descriptionIndex: null
            }
        ];
    }

    /**
     * Parsea un mensaje para extraer informacion de gasto
     * @param {string} text - Texto del mensaje
     * @returns {Object|null} - Objeto con amount y description o null si no se encuentra
     */
    parseExpenseMessage(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }

        // Normalizar texto
        const normalizedText = this.normalizeText(text);
        
        // Intentar cada patron
        for (const pattern of this.patterns) {
            const result = this.tryPattern(normalizedText, pattern);
            if (result) {
                // Validar y normalizar resultado
                const validatedResult = this.validateAndNormalize(result, text);
                if (validatedResult) {
                    return {
                        ...validatedResult,
                        pattern: pattern.name,
                        originalText: text
                    };
                }
            }
        }

        return null;
    }

    /**
     * Normaliza el texto para mejorar el matching
     * @param {string} text - Texto original
     * @returns {string} - Texto normalizado
     */
    normalizeText(text) {
        return text
            .toLowerCase()
            .trim()
            // Normalizar acentos
            .replace(/[áàä]/g, 'a')
            .replace(/[éèë]/g, 'e')
            .replace(/[íìï]/g, 'i')
            .replace(/[óòö]/g, 'o')
            .replace(/[úùü]/g, 'u')
            .replace(/ñ/g, 'n')
            // Normalizar espacios
            .replace(/\s+/g, ' ')
            // Normalizar simbolos de moneda
            .replace(/\$/g, '$')
            .replace(/peso[s]?/g, 'pesos');
    }

    /**
     * Intenta aplicar un patron especifico al texto
     * @param {string} text - Texto normalizado
     * @param {Object} pattern - Patron a aplicar
     * @returns {Object|null} - Resultado del match o null
     */
    tryPattern(text, pattern) {
        const match = text.match(pattern.regex);
        if (!match) {
            return null;
        }

        const amount = match[pattern.amountIndex];
        const description = pattern.descriptionIndex ? match[pattern.descriptionIndex] : null;

        return {
            amount,
            description,
            fullMatch: match[0]
        };
    }

    /**
     * Valida y normaliza el resultado extraido
     * @param {Object} result - Resultado del pattern matching
     * @param {string} originalText - Texto original
     * @returns {Object|null} - Resultado validado o null
     */
    validateAndNormalize(result, originalText) {
        // Normalizar monto
        const amount = this.normalizeAmount(result.amount);
        if (!amount || amount <= 0 || amount > 1000000) {
            return null;
        }

        // Normalizar descripcion
        let description = this.normalizeDescription(result.description, originalText);
        if (!description || description.length < 2) {
            description = 'Gasto';
        }

        return {
            amount,
            description
        };
    }

    /**
     * Normaliza el monto extraido
     * @param {string} amountStr - String del monto
     * @returns {number|null} - Monto normalizado o null
     */
    normalizeAmount(amountStr) {
        if (!amountStr) {
            return null;
        }

        // Remover simbolos y espacios
        let cleanAmount = amountStr
            .replace(/[$pesos\s]/gi, '')
            .replace(/,/g, '.'); // Convertir comas a puntos

        const amount = parseFloat(cleanAmount);
        
        // Validar que sea un numero valido
        if (isNaN(amount) || amount <= 0) {
            return null;
        }

        // Redondear a 2 decimales
        return Math.round(amount * 100) / 100;
    }

    /**
     * Normaliza la descripcion extraida
     * @param {string} descriptionStr - String de la descripcion
     * @param {string} originalText - Texto original para contexto
     * @returns {string} - Descripcion normalizada
     */
    normalizeDescription(descriptionStr, originalText = '') {
        if (!descriptionStr) {
            // Intentar extraer descripcion del texto original
            return this.extractDescriptionFromContext(originalText);
        }

        return descriptionStr
            .trim()
            .replace(/\s+/g, ' ')
            // Remover conectores del inicio/final
            .replace(/^(en|de|por|para|con|del|al)\s+/i, '')
            .replace(/\s+(en|de|por|para|con|del|al)$/i, '')
            // Remover simbolos de moneda residuales
            .replace(/\$\d+/g, '')
            .replace(/\d+\s*pesos?/gi, '')
            .trim()
            // Capitalizar primera letra
            .replace(/^./, str => str.toUpperCase());
    }

    /**
     * Extrae descripcion del contexto cuando no se encuentra explicitamente
     * @param {string} text - Texto original
     * @returns {string} - Descripcion extraida
     */
    extractDescriptionFromContext(text) {
        // Buscar palabras clave comunes de categorias
        const categoryKeywords = {
            'comida': ['taco', 'comida', 'restaurante', 'pizza', 'hamburgues', 'torta'],
            'transporte': ['uber', 'taxi', 'gasolina', 'combustible', 'camion', 'metro'],
            'entretenimiento': ['cine', 'bar', 'cerveza', 'antro', 'pelicula'],
            'compras': ['ropa', 'zapatos', 'camisa', 'pantalon', 'vestido'],
            'servicios': ['luz', 'agua', 'internet', 'telefono', 'netflix'],
            'salud': ['medicina', 'doctor', 'farmacia', 'consulta', 'dentista']
        };

        const normalizedText = text.toLowerCase();
        
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
            for (const keyword of keywords) {
                if (normalizedText.includes(keyword)) {
                    return keyword.charAt(0).toUpperCase() + keyword.slice(1);
                }
            }
        }

        return 'Gasto';
    }

    /**
     * Valida si un texto contiene informacion de gasto
     * @param {string} text - Texto a validar
     * @returns {boolean} - true si parece contener info de gasto
     */
    isExpenseMessage(text) {
        if (!text || typeof text !== 'string') {
            return false;
        }

        const normalizedText = this.normalizeText(text);

        // Buscar palabras clave de gasto
        const hasExpenseKeyword = this.expenseKeywords.some(keyword => 
            normalizedText.includes(keyword)
        );

        // Buscar patrones de moneda
        const hasCurrencyPattern = /\$?\d+(?:[.,]\d{1,2})?\s*(?:pesos?)?/i.test(normalizedText);

        return hasExpenseKeyword || hasCurrencyPattern;
    }

    /**
     * Extrae multiples gastos de un solo mensaje
     * @param {string} text - Texto del mensaje
     * @returns {Array} - Array de gastos encontrados
     */
    parseMultipleExpenses(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const expenses = [];
        
        // Dividir por separadores comunes
        const separators = /[,;y\n]/i;
        const parts = text.split(separators);

        for (const part of parts) {
            const expense = this.parseExpenseMessage(part.trim());
            if (expense) {
                expenses.push(expense);
            }
        }

        // Si no se encontraron multiples, intentar como uno solo
        if (expenses.length === 0) {
            const singleExpense = this.parseExpenseMessage(text);
            if (singleExpense) {
                expenses.push(singleExpense);
            }
        }

        return expenses;
    }

    /**
     * Obtiene estadisticas del parser para debugging
     * @returns {Object} - Estadisticas de patrones
     */
    getPatternStats() {
        return {
            totalPatterns: this.patterns.length,
            patterns: this.patterns.map(p => ({
                name: p.name,
                regex: p.regex.source
            })),
            expenseKeywords: this.expenseKeywords.length,
            currencySymbols: this.currencySymbols
        };
    }
}

// Crear instancia singleton
const messageParser = new MessageParser();

// Exportar funciones principales para facilitar el uso
module.exports = {
    MessageParser,
    parseExpenseMessage: (text) => messageParser.parseExpenseMessage(text),
    parseMultipleExpenses: (text) => messageParser.parseMultipleExpenses(text),
    isExpenseMessage: (text) => messageParser.isExpenseMessage(text),
    normalizeAmount: (amount) => messageParser.normalizeAmount(amount),
    normalizeDescription: (desc, context) => messageParser.normalizeDescription(desc, context),
    getPatternStats: () => messageParser.getPatternStats()
};