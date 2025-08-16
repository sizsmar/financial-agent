const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    makeInMemoryStore,
    Browsers
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { 
    createTransaction, 
    getSpendingStats, 
    shouldSendAlert,
    getUserConfig 
} = require('../database/models');

const { parseExpenseMessage, isExpenseMessage } = require('../services/parser');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.store = null;
        this.sessionPath = process.env.WHATSAPP_SESSION_PATH || './session';
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    async initialize() {
        try {
            console.log('Inicializando WhatsApp Bot...');
            
            // Crear directorio de sesion si no existe
            if (!fs.existsSync(this.sessionPath)) {
                fs.mkdirSync(this.sessionPath, { recursive: true });
            }

            // Configurar store para mantener conversaciones
            this.store = makeInMemoryStore({});
            
            // Configurar autenticacion multi-archivo
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
            
            // Crear socket de WhatsApp
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: true,
                browser: Browsers.ubuntu('Financial Agent'),
                generateHighQualityLinkPreview: true,
                defaultQueryTimeoutMs: 60000,
            });

            // Bind store to socket
            this.store.bind(this.sock.ev);

            // Event handlers
            this.setupEventHandlers(saveCreds);

            return this.sock;
        } catch (error) {
            console.error('Error inicializando bot:', error);
            throw error;
        }
    }

    setupEventHandlers(saveCreds) {
        // Manejo de credenciales
        this.sock.ev.on('creds.update', saveCreds);

        // Manejo de conexion
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                console.log('Conexion cerrada. Reconectar:', shouldReconnect);
                
                if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Intento de reconexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                    
                    // Esperar antes de reconectar
                    setTimeout(() => {
                        this.initialize();
                    }, 5000 * this.reconnectAttempts);
                } else {
                    console.log('Maximo de intentos de reconexion alcanzado');
                    this.isConnected = false;
                }
            } else if (connection === 'open') {
                console.log('WhatsApp Bot conectado exitosamente');
                this.isConnected = true;
                this.reconnectAttempts = 0;
            }
        });

        // Manejo de mensajes
        this.sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            await this.handleMessage(message);
        });

        // Manejo de updates de mensajes (leido, entregado, etc.)
        this.sock.ev.on('messages.update', (messages) => {
            // Store updates for message status
            for (const message of messages) {
                if (message.update?.status) {
                    console.log(`Mensaje ${message.key.id} - Status: ${message.update.status}`);
                }
            }
        });
    }

    async handleMessage(message) {
        try {
            // Ignorar mensajes propios y mensajes sin contenido
            if (message.key.fromMe || !message.message) return;

            const messageContent = this.extractMessageText(message);
            if (!messageContent) return;

            const userPhone = message.key.remoteJid;
            const userName = message.pushName || 'Usuario';

            console.log(`Mensaje de ${userName} (${userPhone}): ${messageContent}`);

            // Procesar mensaje
            const response = await this.processMessage(messageContent, userPhone, userName);
            
            // Enviar respuesta
            if (response) {
                await this.sendMessage(userPhone, response);
            }

        } catch (error) {
            console.error('Error procesando mensaje:', error);
            await this.sendMessage(message.key.remoteJid, 'Error procesando tu mensaje. Intenta de nuevo.');
        }
    }

    extractMessageText(message) {
        // Extraer texto del mensaje dependiendo del tipo
        if (message.message?.conversation) {
            return message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            return message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage?.caption) {
            return message.message.imageMessage.caption;
        }
        return null;
    }

    async processMessage(messageText, userPhone, userName) {
        const text = messageText.toLowerCase().trim();

        // Comando /start
        if (text === '/start' || text === 'start' || text === 'hola') {
            return this.getWelcomeMessage(userName);
        }

        // Comando /help
        if (text === '/help' || text === 'help' || text === 'ayuda') {
            return this.getHelpMessage();
        }

        // Comando /balance
        if (text === '/balance' || text === 'balance') {
            return await this.getBalanceMessage(userPhone);
        }

        // Comando /reporte
        if (text.startsWith('/reporte') || text.startsWith('reporte')) {
            const period = this.extractPeriod(text);
            return await this.getReportMessage(userPhone, period);
        }

        // Comando /limites
        if (text.startsWith('/limites') || text.startsWith('limites')) {
            return this.getLimitsHelp();
        }

        // Comando /categorias
        if (text === '/categorias' || text === 'categorias') {
            return await this.getCategoriesMessage();
        }

        // Procesamiento de gastos (texto libre)
        if (isExpenseMessage(messageText)) {
            const expenseData = parseExpenseMessage(messageText);
            if (expenseData) {
                return await this.registerExpense(userPhone, expenseData, messageText);
            }
        }

        // Mensaje no reconocido
        return `No entendi tu mensaje. Escribe "/help" para ver los comandos disponibles.\n\nTambien puedes escribir gastos como:\n- "gaste $300 en tacos"\n- "compre $50 de gasolina"\n- "pague 200 pesos por uber"`;
    }


    async registerExpense(userPhone, expenseData, originalText) {
        try {
            const { amount, description } = expenseData;
            
            // Crear transaccion
            const transaction = await createTransaction(
                userPhone, 
                amount, 
                description, 
                null, // categoria automatica
                'whatsapp',
                originalText
            );

            // Verificar alertas
            const alertCheck = await shouldSendAlert(userPhone, 'day');
            
            let response = `*Gasto registrado*\n\n`;
            response += `*Monto:* $${amount}\n`;
            response += `*Descripcion:* ${description}\n`;
            response += `*Categoria:* ${transaction.category}\n`;
            response += `*Fecha:* ${new Date(transaction.date).toLocaleString('es-MX')}\n`;

            // Agregar alerta si es necesario
            if (alertCheck.shouldAlert) {
                response += `\n*ALERTA:* Has gastado el ${alertCheck.stats.percentage}% de tu limite diario ($${alertCheck.stats.limit})`;
            }

            // Agregar resumen del dia
            const todayStats = await getSpendingStats(userPhone, 'day');
            response += `\n*Hoy:* $${todayStats.totalSpent} de $${todayStats.limit} (${todayStats.percentage}%)`;

            return response;

        } catch (error) {
            console.error('Error registrando gasto:', error);
            return 'Error al registrar el gasto. Intenta de nuevo.';
        }
    }

    async getBalanceMessage(userPhone) {
        try {
            const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
                getSpendingStats(userPhone, 'day'),
                getSpendingStats(userPhone, 'week'),
                getSpendingStats(userPhone, 'month')
            ]);

            let response = `*Tu Balance Financiero*\n\n`;
            
            response += `*HOY*\n`;
            response += `Gastado: $${dailyStats.totalSpent}\n`;
            response += `Limite: $${dailyStats.limit}\n`;
            response += `Progreso: ${dailyStats.percentage}%\n`;
            response += `Disponible: $${dailyStats.remainingBudget}\n\n`;
            
            response += `*ESTA SEMANA*\n`;
            response += `Gastado: $${weeklyStats.totalSpent}\n`;
            response += `Limite: $${weeklyStats.limit}\n`;
            response += `Progreso: ${weeklyStats.percentage}%\n\n`;
            
            response += `*ESTE MES*\n`;
            response += `Gastado: $${monthlyStats.totalSpent}\n`;
            response += `Limite: $${monthlyStats.limit}\n`;
            response += `Progreso: ${monthlyStats.percentage}%\n\n`;

            // Top categorias del mes
            if (monthlyStats.byCategory && monthlyStats.byCategory.length > 0) {
                response += `*Top Categorias (Mes)*\n`;
                monthlyStats.byCategory.slice(0, 3).forEach((cat, index) => {
                    response += `${index + 1}. ${cat.category}: $${cat.total}\n`;
                });
            }

            return response;

        } catch (error) {
            console.error('Error obteniendo balance:', error);
            return 'Error al obtener tu balance. Intenta de nuevo.';
        }
    }

    async getReportMessage(userPhone, period = 'week') {
        try {
            const stats = await getSpendingStats(userPhone, period);
            
            let response = `*Reporte ${period === 'day' ? 'Diario' : period === 'week' ? 'Semanal' : 'Mensual'}*\n\n`;
            
            response += `*Total gastado:* $${stats.totalSpent}\n`;
            response += `*Limite:* $${stats.limit}\n`;
            response += `*Porcentaje usado:* ${stats.percentage}%\n`;
            response += `*Presupuesto restante:* $${stats.remainingBudget}\n\n`;

            if (stats.byCategory && stats.byCategory.length > 0) {
                response += `*Gastos por Categoria:*\n`;
                stats.byCategory.forEach(cat => {
                    response += `- ${cat.category}: $${cat.total} (${cat.transactionCount} gastos)\n`;
                });
            }

            return response;

        } catch (error) {
            console.error('Error generando reporte:', error);
            return 'Error al generar el reporte. Intenta de nuevo.';
        }
    }

    extractPeriod(text) {
        if (text.includes('diario') || text.includes('dia') || text.includes('hoy')) {
            return 'day';
        } else if (text.includes('semanal') || text.includes('semana')) {
            return 'week';
        } else if (text.includes('mensual') || text.includes('mes')) {
            return 'month';
        }
        return 'week'; // default
    }

    getWelcomeMessage(userName) {
        return `Hola ${userName}!\n\n` +
               `Soy tu *Asistente Financiero Personal*\n\n` +
               `Puedo ayudarte a:\n` +
               `- Registrar tus gastos\n` +
               `- Categorizarlos automaticamente\n` +
               `- Ver tu balance y reportes\n` +
               `- Enviarte alertas de limites\n\n` +
               `*Comandos disponibles:*\n` +
               `- /balance - Ver tu balance actual\n` +
               `- /reporte - Generar reportes\n` +
               `- /help - Ver ayuda completa\n\n` +
               `*Registrar gastos:*\n` +
               `Solo escribe algo como:\n` +
               `- "gaste $300 en tacos"\n` +
               `- "compre $50 de gasolina"\n` +
               `- "pague 200 por uber"\n\n` +
               `Empecemos!`;
    }

    getHelpMessage() {
        return `*Comandos Disponibles:*\n\n` +
               `*Basicos:*\n` +
               `- /start - Mensaje de bienvenida\n` +
               `- /help - Esta ayuda\n` +
               `- /balance - Tu balance actual\n\n` +
               `*Reportes:*\n` +
               `- /reporte diario\n` +
               `- /reporte semanal\n` +
               `- /reporte mensual\n\n` +
               `*Informacion:*\n` +
               `- /categorias - Ver categorias\n\n` +
               `*Registrar Gastos:*\n` +
               `Escribe naturalmente:\n` +
               `- "gaste $300 en restaurante"\n` +
               `- "compre $50.5 de gasolina"\n` +
               `- "pague 200 pesos por uber"\n` +
               `- "tacos $45"\n` +
               `- "$100 en super"\n\n` +
               `Es asi de facil!`;
    }

    async getCategoriesMessage() {
        try {
            const { getCategories } = require('../database/models');
            const categories = await getCategories();
            
            let response = `*Categorias Disponibles:*\n\n`;
            
            categories.forEach(category => {
                response += `*${category.name}*\n`;
                if (category.keywords && category.keywords.length > 0) {
                    response += `   Palabras clave: ${category.keywords.join(', ')}\n`;
                }
                response += '\n';
            });

            response += `*Tip:* Los gastos se categorizan automaticamente segun las palabras que uses.`;
            
            return response;

        } catch (error) {
            console.error('Error obteniendo categorias:', error);
            return 'Error al obtener las categorias. Intenta de nuevo.';
        }
    }

    getLimitsHelp() {
        return `*Configuracion de Limites*\n\n` +
               `Los limites se configuran automaticamente:\n` +
               `- Diario: $100\n` +
               `- Semanal: $1,000\n` +
               `- Mensual: $10,000\n\n` +
               `*Alertas automaticas al:*\n` +
               `- 70% del limite\n` +
               `- 90% del limite\n\n` +
               `Proximamente podras personalizar estos limites.`;
    }

    async sendMessage(to, text) {
        try {
            if (!this.isConnected) {
                console.log('Bot no conectado, no se puede enviar mensaje');
                return;
            }

            await this.sock.sendMessage(to, { text });
            console.log(`Mensaje enviado a ${to}`);
            
        } catch (error) {
            console.error('Error enviando mensaje:', error);
        }
    }

    async disconnect() {
        try {
            if (this.sock) {
                await this.sock.logout();
                console.log('Bot desconectado');
            }
        } catch (error) {
            console.error('Error desconectando bot:', error);
        }
    }

    // Getter para verificar estado de conexion
    get connected() {
        return this.isConnected;
    }
}

module.exports = WhatsAppBot;