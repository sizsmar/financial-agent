/**
 * Archivo de pruebas para el categorizador y alertas
 * Ejecutar con: node src/services/test-categorizer.js
 */

const { categorizeExpense, analyzeSpendingPatterns, getSuggestions } = require('./categorizer');
const { checkAllAlerts, generateDailySummary } = require('./alerts');

console.log('=== PRUEBAS DEL CATEGORIZADOR Y ALERTAS ===\n');

async function testCategorizer() {
    console.log('1. PRUEBAS DE CATEGORIZACION:\n');
    
    const testCases = [
        // Comida
        'tacos del puesto',
        'mcdonalds hamburguesa',
        'restaurante japones',
        'desayuno en cafe',
        
        // Transporte
        'gasolina pemex',
        'uber a casa',
        'taxi aeropuerto',
        'metro tarjeta',
        
        // Entretenimiento
        'boletos cine',
        'netflix mensual',
        'bar con amigos',
        'videojuego steam',
        
        // Compras
        'ropa nueva',
        'amazon envio',
        'zapatos nike',
        'regalo mama',
        
        // Servicios
        'luz cfe',
        'internet telmex',
        'telefono telcel',
        'agua gobierno',
        
        // Salud
        'farmacia guadalajara',
        'consulta doctor',
        'medicina gripe',
        'dentista limpieza',
        
        // Casos ambiguos
        'regalo cumpleanos',
        'pago juan',
        'cosa importante',
        'producto especial'
    ];
    
    for (const testCase of testCases) {
        try {
            const category = await categorizeExpense(testCase, '+521234567890');
            console.log(`"${testCase}" -> ${category}`);
        } catch (error) {
            console.log(`"${testCase}" -> ERROR: ${error.message}`);
        }
    }
}

async function testAlerts() {
    console.log('\n2. PRUEBAS DE ALERTAS:\n');
    
    const testUserPhone = '+521234567890';
    
    // Simular diferentes tipos de gastos para alertas
    const alertTests = [
        { amount: 50, category: 'comida', desc: 'Gasto normal' },
        { amount: 150, category: 'transporte', desc: 'Gasto medio' },
        { amount: 500, category: 'entretenimiento', desc: 'Gasto alto' },
        { amount: 1000, category: 'compras', desc: 'Gasto muy alto' },
        { amount: 2000, category: 'otros', desc: 'Gasto excepcional' }
    ];
    
    for (const test of alertTests) {
        try {
            console.log(`\nProbando: ${test.desc} - $${test.amount} en ${test.category}`);
            const alerts = await checkAllAlerts(testUserPhone, test.amount, test.category);
            
            if (alerts.length === 0) {
                console.log('  Sin alertas generadas');
            } else {
                console.log(`  ${alerts.length} alerta(s) generada(s):`);
                alerts.forEach((alert, index) => {
                    console.log(`    ${index + 1}. [${alert.type}] ${alert.message}`);
                });
            }
        } catch (error) {
            console.log(`  ERROR: ${error.message}`);
        }
    }
}

async function testPatternAnalysis() {
    console.log('\n3. PRUEBAS DE ANALISIS DE PATRONES:\n');
    
    const testUserPhone = '+521234567890';
    
    try {
        console.log('Analizando patrones de gasto...');
        const patterns = await analyzeSpendingPatterns(testUserPhone, 30);
        
        if (patterns) {
            console.log(`Total de transacciones: ${patterns.total_transactions}`);
            console.log(`Monto total: $${patterns.total_amount.toFixed(2)}\n`);
            
            console.log('Gastos por categoria:');
            Object.entries(patterns.by_category).forEach(([category, data]) => {
                console.log(`  ${category}: ${data.count} gastos, $${data.total.toFixed(2)} total, $${data.avg.toFixed(2)} promedio`);
            });
            
            console.log('\nGastos por hora del dia:');
            Object.entries(patterns.by_time)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .forEach(([hour, data]) => {
                    console.log(`  ${hour}:00 - ${data.count} gastos, $${data.amount.toFixed(2)}`);
                });
        } else {
            console.log('No se encontraron patrones (probablemente no hay datos)');
        }
        
    } catch (error) {
        console.log(`ERROR: ${error.message}`);
    }
}

async function testSuggestions() {
    console.log('\n4. PRUEBAS DE SUGERENCIAS:\n');
    
    const testUserPhone = '+521234567890';
    
    try {
        console.log('Generando sugerencias...');
        const suggestions = await getSuggestions(testUserPhone);
        
        if (suggestions.length === 0) {
            console.log('No se generaron sugerencias (probablemente faltan datos)');
        } else {
            console.log(`${suggestions.length} sugerencia(s) generada(s):`);
            suggestions.forEach((suggestion, index) => {
                console.log(`  ${index + 1}. [${suggestion.type}] ${suggestion.message}`);
            });
        }
        
    } catch (error) {
        console.log(`ERROR: ${error.message}`);
    }
}

async function testDailySummary() {
    console.log('\n5. PRUEBAS DE RESUMEN DIARIO:\n');
    
    const testUserPhone = '+521234567890';
    
    try {
        console.log('Generando resumen diario...');
        const summary = await generateDailySummary(testUserPhone);
        
        if (summary) {
            console.log(`Fecha: ${summary.date}`);
            console.log(`Transacciones: ${summary.totalTransactions}`);
            console.log(`Total gastado: $${summary.totalSpent.toFixed(2)}`);
            console.log(`Progreso diario: ${summary.dailyProgress.toFixed(1)}%`);
            
            if (summary.categories.length > 0) {
                console.log('\nPor categoria:');
                summary.categories.forEach(cat => {
                    console.log(`  ${cat.name}: $${cat.amount.toFixed(2)} (${cat.transactions} transacciones)`);
                });
            }
            
            console.log(`\nMensaje: ${summary.message}`);
        } else {
            console.log('No se pudo generar resumen (probablemente no hay datos del dia)');
        }
        
    } catch (error) {
        console.log(`ERROR: ${error.message}`);
    }
}

// Ejecutar todas las pruebas
async function runAllTests() {
    try {
        await testCategorizer();
        await testAlerts();
        await testPatternAnalysis();
        await testSuggestions();
        await testDailySummary();
        
        console.log('\n=== PRUEBAS COMPLETADAS ===');
        console.log('\nNOTA: Algunas pruebas pueden no mostrar resultados si no hay datos en la base de datos.');
        console.log('Para probar completamente, registra algunos gastos primero usando el bot.');
        
    } catch (error) {
        console.error('Error ejecutando pruebas:', error);
    } finally {
        // Cerrar conexiones si es necesario
        process.exit(0);
    }
}

runAllTests();