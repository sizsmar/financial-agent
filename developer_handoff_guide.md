## 📋 Resumen del Proyecto

**Objetivo:** Bot de WhatsApp para gestión financiera personal que registra gastos, categoriza automáticamente y envía alertas inteligentes.

**Estado Actual:** 40% completado - Infraestructura base lista, lógica de negocio pendiente.

**Stack Tecnológico:**
- **Backend:** Node.js + Express
- **Base de Datos:** PostgreSQL
- **WhatsApp API:** Baileys (@whiskeysockets/baileys)
- **Categorización:** Lógica basada en keywords y reglas
- **Deployment:** VPS Linux + PM2

---

## 🏗️ Arquitectura del Sistema

```mermaid
graph TD
    A[WhatsApp User] --> B[Baileys API]
    B --> C[Message Parser]
    C --> D[Category Engine]
    D --> E[Transaction Model]
    E --> F[PostgreSQL]
    F --> G[Alert Engine]
    G --> H[Response Generator]
    H --> B
```

### Flujo Principal:
1. Usuario envía mensaje: "gasté $300 en restaurante"
2. Parser extrae: amount=300, description="restaurante"
3. Category Engine busca keywords: category="comida"
4. Se guarda en BD y envía confirmación
5. Motor de alertas verifica límites

---

## 📁 Estructura del Proyecto

```
financial-agent/
├── src/
│   ├── app.js                 # 🔴 Vacío - Punto de entrada principal
│   ├── bot/
│   │   └── whatsapp.js        # 🔴 Vacío - Lógica de WhatsApp Bot
│   ├── database/
│   │   ├── db.js              # ✅ Completo - Conexión PostgreSQL
│   │   └── models.js          # 🔴 Vacío - Modelos y CRUD
│   ├── services/              # ⚠️ No existe - Crear
│   │   ├── categorizer.js     # Motor de categorización
│   │   ├── parser.js          # Parser de mensajes
│   │   └── alerts.js          # Motor de alertas
│   └── utils/                 # ⚠️ No existe - Crear
│       ├── logger.js          # Sistema de logs
│       └── validators.js      # Validaciones
├── config/
│   └── database.sql           # ✅ Completo - Schema BD
├── logs/                      # ⚠️ No existe - Crear
├── session/                   # ⚠️ No existe - Crear (sesión WhatsApp)
├── .env                       # 🔴 Vacío - Variables de entorno
├── .gitignore                 # ✅ Completo
└── package.json               # ✅ Completo
```

**Leyenda:**
- ✅ Completo y funcional
- 🔴 Archivo existe pero está vacío
- ⚠️ No existe, debe crearse

---

## 🔧 Configuración del Entorno

### 1. Variables de Entorno (.env)
```env
# Base de datos PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=financial_agent
DB_USER=tu_usuario_db
DB_PASSWORD=tu_password_db
DB_CONNECTION_STRING=postgresql://usuario:password@localhost:5432/financial_agent

# Bot Configuration
BOT_NAME=FinancialAgent
WHATSAPP_SESSION_PATH=./session

# Environment
NODE_ENV=development
PORT=3000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### 2. Base de Datos
**Estado:** ✅ Schema creado en `config/database.sql`

**Configurar BD:**
```bash
# 1. Crear BD y ejecutar schema
sudo -u postgres psql
CREATE DATABASE financial_agent;
\q

# 2. Ejecutar schema
psql -U tu_usuario -d financial_agent -f config/database.sql

# 3. Verificar tablas
psql -U tu_usuario -d financial_agent -c "\dt"
```

**Tablas principales:**
- `transactions` - Registro de gastos
- `categories` - Categorías con keywords
- `user_config` - Límites y configuración por usuario

### 3. Dependencias Adicionales Necesarias
```bash
npm install joi winston node-cron
```

---

## 🚨 Tareas Críticas Pendientes

### ⚡ PRIORIDAD 1 - Esta Semana

#### 1. Completar `src/database/models.js`
```javascript
// Funciones requeridas:
- createTransaction(userPhone, amount, description, category)
- getTransactionsByUser(userPhone, dateRange)
- getTotalSpentByPeriod(userPhone, period)
- getUserConfig(userPhone)
- updateUserConfig(userPhone, config)
- getCategories()
- categorizeByKeywords(description)
```

#### 2. Implementar `src/bot/whatsapp.js`
```javascript
// Funcionalidades requeridas:
- Conexión con Baileys
- Manejo de mensajes entrantes
- Procesamiento de comandos
- Envío de respuestas
- Persistencia de sesión
```

#### 3. Crear `src/app.js`
```javascript
// Responsabilidades:
- Inicializar bot de WhatsApp
- Configurar Express server
- Conectar a base de datos
- Manejo global de errores
- Graceful shutdown
```

### ⚡ PRIORIDAD 2 - Próxima Semana

#### 4. Parser de Mensajes (`src/services/parser.js`)
```javascript
// Regex patterns para detectar:
- "gasté $100 en tacos"
- "compré $50.5 de gasolina"  
- "pagué 200 pesos por uber"
- Normalización de montos y descripciones
```

#### 5. Motor de Categorización (`src/services/categorizer.js`)
```javascript
// Funciones:
- categorizeByKeywords(description)
- analyzeSpendingPatterns(transactions)
- updateCategoryKeywords(category, newKeywords)
- smartCategorization(description, userHistory)
```

#### 6. Motor de Alertas (`src/services/alerts.js`)
```javascript
// Lógica de alertas:
- checkDailyLimits(userPhone)
- checkWeeklyLimits(userPhone)
- checkMonthlyLimits(userPhone)
- sendAlert(userPhone, alertType, data)
```

---

## 💡 Comandos del Bot (Especificación)

### Comandos Principales:
| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `/start` | Inicializar bot y configurar usuario | `/start` |
| `/gaste $X en Y` | Registrar gasto | `/gaste $300 en restaurante` |
| `/balance` | Ver resumen del día | `/balance` |
| `/limites` | Configurar límites | `/limites diario 500` |
| `/reporte` | Generar reporte período | `/reporte semanal` |
| `/categorias` | Ver/editar categorías | `/categorias` |
| `/help` | Mostrar ayuda | `/help` |

### Procesamiento de Texto Libre:
- "gasté 300 en tacos" → Parser automático
- "compré gasolina por $200" → Parser automático
- "pagué la renta 8000" → Parser automático

---

## 🔍 Testing y Validación

### Scripts de Testing Requeridos:
```json
{
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js",
    "test": "echo 'Tests pendientes'",
    "test:db": "node -e \"require('./src/database/db').testConnection()\"",
    "setup:db": "psql -U $DB_USER -d $DB_NAME -f config/database.sql",
    "logs": "tail -f logs/app.log"
  }
}
```

### Casos de Prueba Críticos:
1. **Conexión DB:** ✅ Ya funciona
2. **Registro de gasto:** Flujo completo end-to-end
3. **Categorización:** Texto → Keywords Engine → Categoría correcta
4. **Alertas:** Superar límite → Recibir notificación
5. **Persistencia:** Reconexión WhatsApp después de desconexión

---

## 📚 Recursos y Documentación

### APIs y Librerías:
- **Baileys:** [Documentación](https://github.com/WhiskeySockets/Baileys)
- **PostgreSQL Node:** [node-postgres](https://node-postgres.com/)
- **Winston Logging:** [Documentación](https://github.com/winstonjs/winston)

### Algoritmo de Categorización:
```javascript
// Ejemplo de lógica de categorización por keywords
function categorizeExpense(description) {
  const categories = {
    'comida': ['restaurante', 'tacos', 'delivery', 'rappi', 'ubereats'],
    'transporte': ['uber', 'gasolina', 'taxi', 'camion'],
    'entretenimiento': ['cine', 'bar', 'antro', 'netflix'],
    // ... más categorías
  };
  
  // Buscar matches en keywords
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => description.toLowerCase().includes(keyword))) {
      return category;
    }
  }
  
  return 'otros'; // Default
}
```

### Debugging:
```bash
# Logs en tiempo real
npm run logs

# Testing de conexión DB
npm run test:db

# Desarrollo con auto-reload
npm run dev
```

---

## 🎯 Objetivos del MVP (Próximas 2-3 Semanas)

### ✅ Criterios de Éxito:
- [ ] Bot responde a mensajes de WhatsApp
- [ ] Registra gastos desde texto libre
- [ ] Categoriza automáticamente por keywords
- [ ] Almacena en base de datos
- [ ] Envía confirmaciones y alertas
- [ ] Maneja al menos 50 transacciones sin fallar
- [ ] Reconecta automáticamente si se desconecta

### 🚀 Funcionalidades Mínimas:
1. Registro de gastos básico
2. Categorización automática
3. Límites diarios/mensuales
4. Alertas por límites
5. Reporte diario automático

---

## 🆘 Contacto y Escalación

### Si encuentras problemas:
1. **Configuración BD:** Verificar credenciales en .env
2. **WhatsApp API:** Revisar logs de conexión Baileys
3. **Categorización:** Verificar keywords en base de datos
4. **General:** Logs detallados en `logs/app.log`

### Notas Técnicas Importantes:
- **Sesión WhatsApp** se guarda en `/session` - no borrar
- **Keywords** están en tabla `categories` - actualizables dinámicamente
- **PostgreSQL** usar connection pooling (ya configurado)
- **Deployment** preparado para PM2 en producción

---

## 📈 Roadmap Post-MVP

### Versión 2.0 (Futuro):
- [ ] OCR para tickets/recibos
- [ ] Dashboard web
- [ ] Integración APIs bancarias
- [ ] Machine Learning para categorización avanzada
- [ ] Multi-usuario
- [ ] Reportes avanzados con gráficas
- [ ] Integración con LLMs para análisis inteligente

---

**¡Éxito en el desarrollo! 🚀**

*Última actualización: Agosto 2025*
