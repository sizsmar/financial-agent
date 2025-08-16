const express = require('express');
const path = require('path');
require('dotenv').config();

// Importar modulos propios
const { testConnection, closePool } = require('./database/db');
const WhatsAppBot = require('./bot/whatsapp');

class FinancialAgentApp {
    constructor() {
        this.app = express();
        this.bot = null;
        this.server = null;
        this.port = process.env.PORT || 3000;
        this.isShuttingDown = false;
    }

    async initialize() {
        try {
            console.log('=== FINANCIAL AGENT BOT ===');
            console.log('Inicializando aplicacion...');

            // Configurar Express
            await this.setupExpress();

            // Conectar a base de datos
            await this.connectDatabase();

            // Inicializar bot de WhatsApp
            await this.initializeBot();

            // Configurar manejo de señales
            this.setupGracefulShutdown();

            console.log('Aplicacion inicializada correctamente');
            return true;

        } catch (error) {
            console.error('Error inicializando aplicacion:', error);
            await this.shutdown();
            process.exit(1);
        }
    }

    setupExpress() {
        return new Promise((resolve) => {
            // Middleware basico
            this.app.use(express.json());
            this.app.use(express.urlencoded({ extended: true }));

            // Middleware de logging
            this.app.use((req, res, next) => {
                console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
                next();
            });

            // Rutas de salud y estado
            this.app.get('/', (req, res) => {
                res.json({
                    status: 'running',
                    service: 'Financial Agent Bot',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    bot_connected: this.bot ? this.bot.connected : false
                });
            });

            this.app.get('/health', (req, res) => {
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    checks: {
                        bot_connected: this.bot ? this.bot.connected : false,
                        database: 'connected',
                        uptime: process.uptime()
                    }
                };
                res.json(health);
            });

            this.app.get('/status', (req, res) => {
                res.json({
                    bot_status: this.bot ? (this.bot.connected ? 'connected' : 'disconnected') : 'not_initialized',
                    uptime: process.uptime(),
                    memory_usage: process.memoryUsage(),
                    pid: process.pid
                });
            });

            // Ruta para obtener QR (en caso de que se necesite)
            this.app.get('/qr', (req, res) => {
                if (this.bot && this.bot.connected) {
                    res.json({ message: 'Bot ya esta conectado' });
                } else {
                    res.json({ message: 'Revisa la consola para el codigo QR' });
                }
            });

            // Manejo de errores de Express
            this.app.use((err, req, res, next) => {
                console.error('Error en Express:', err);
                res.status(500).json({
                    error: 'Error interno del servidor',
                    timestamp: new Date().toISOString()
                });
            });

            // Manejo de rutas no encontradas
            this.app.use('*', (req, res) => {
                res.status(404).json({
                    error: 'Ruta no encontrada',
                    path: req.originalUrl,
                    timestamp: new Date().toISOString()
                });
            });

            console.log('Express configurado correctamente');
            resolve();
        });
    }

    async connectDatabase() {
        try {
            console.log('Conectando a base de datos...');
            
            const isConnected = await testConnection();
            if (!isConnected) {
                throw new Error('No se pudo conectar a la base de datos');
            }

            console.log('Base de datos conectada correctamente');
            return true;

        } catch (error) {
            console.error('Error conectando a base de datos:', error);
            throw error;
        }
    }

    async initializeBot() {
        try {
            console.log('Inicializando bot de WhatsApp...');
            
            this.bot = new WhatsAppBot();
            await this.bot.initialize();

            console.log('Bot de WhatsApp inicializado correctamente');
            return true;

        } catch (error) {
            console.error('Error inicializando bot:', error);
            throw error;
        }
    }

    startServer() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Servidor HTTP escuchando en puerto ${this.port}`);
                    console.log(`URLs disponibles:`);
                    console.log(`- http://localhost:${this.port}/`);
                    console.log(`- http://localhost:${this.port}/health`);
                    console.log(`- http://localhost:${this.port}/status`);
                    console.log('');
                    console.log('=== BOT LISTO PARA RECIBIR MENSAJES ===');
                    resolve();
                }
            });

            this.server.on('error', (error) => {
                console.error('Error en servidor HTTP:', error);
                reject(error);
            });
        });
    }

    setupGracefulShutdown() {
        // Manejo de señales del sistema
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.log(`Recibida señal ${signal}, iniciando shutdown graceful...`);
                await this.shutdown();
                process.exit(0);
            });
        });

        // Manejo de errores no capturados
        process.on('uncaughtException', async (error) => {
            console.error('Error no capturado:', error);
            await this.shutdown();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('Promise rechazada no manejada:', reason);
            await this.shutdown();
            process.exit(1);
        });

        console.log('Manejo de señales configurado');
    }

    async shutdown() {
        if (this.isShuttingDown) {
            return;
        }

        this.isShuttingDown = true;
        console.log('Iniciando shutdown graceful...');

        try {
            // Cerrar servidor HTTP
            if (this.server) {
                console.log('Cerrando servidor HTTP...');
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                console.log('Servidor HTTP cerrado');
            }

            // Desconectar bot de WhatsApp
            if (this.bot) {
                console.log('Desconectando bot de WhatsApp...');
                await this.bot.disconnect();
                console.log('Bot de WhatsApp desconectado');
            }

            // Cerrar conexiones de base de datos
            console.log('Cerrando conexiones de base de datos...');
            await closePool();
            console.log('Conexiones de base de datos cerradas');

            console.log('Shutdown completado');

        } catch (error) {
            console.error('Error durante shutdown:', error);
        }
    }

    // Metodos de utilidad
    getStatus() {
        return {
            bot_connected: this.bot ? this.bot.connected : false,
            server_running: this.server ? true : false,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            is_shutting_down: this.isShuttingDown
        };
    }

    async restart() {
        console.log('Reiniciando aplicacion...');
        await this.shutdown();
        await this.initialize();
        await this.startServer();
        console.log('Aplicacion reiniciada');
    }
}

// Funcion principal
async function main() {
    const app = new FinancialAgentApp();
    
    try {
        await app.initialize();
        await app.startServer();
    } catch (error) {
        console.error('Error fatal:', error);
        process.exit(1);
    }
}

// Exportar para testing y uso externo
module.exports = {
    FinancialAgentApp,
    main
};

// Ejecutar si es el archivo principal
if (require.main === module) {
    main().catch(error => {
        console.error('Error ejecutando aplicacion:', error);
        process.exit(1);
    });
}