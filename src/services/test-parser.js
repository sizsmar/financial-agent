/**
 * Archivo de pruebas para el parser de mensajes
 * Ejecutar con: node src/services/test-parser.js
 */

const { 
    parseExpenseMessage, 
    parseMultipleExpenses, 
    isExpenseMessage,
    getPatternStats 
} = require('./parser');

console.log('=== PRUEBAS DEL PARSER DE MENSAJES ===\n');

// Casos de prueba
const testCases = [
    // Formato clasico: accion + monto + conector + descripcion
    'gaste $300 en tacos',
    'compre $50.5 de gasolina',
    'pague 200 pesos por uber',
    'di $150 en el super',
    
    // Formato: descripcion + monto
    'tacos $45',
    'gasolina 200',
    'renta $8000',
    'cerveza $80.50',
    
    // Formato: monto + conector + descripcion
    '$100 en comida',
    '500 pesos de ropa',
    '$25.99 por el cafe',
    
    // Formato: accion + descripcion + conector + monto
    'compre gasolina por $200',
    'pague la renta por 8000 pesos',
    'di para comida $150',
    
    // Casos sin conectores
    'gasto 300 tacos',
    'compro 50 gasolina',
    
    // Casos con variaciones
    'Gasté $300 en unos tacos bien ricos',
    'COMPRE $50 DE GASOLINA',
    'pague 200 pesos por el uber de ayer',
    
    // Casos edge
    '$300',
    '150 pesos',
    'solo 25',
    
    // Casos que NO deben parsear
    'hola como estas',
    'que tal el dia',
    'tengo 300 pesos',
    'cuanto cuesta esto',
    
    // Casos con errores comunes
    'gaste $300,50 en tacos',
    'compre gasolina $50.5',
    'pague por uber $25',
];

console.log('1. PRUEBAS INDIVIDUALES:\n');

testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: "${testCase}"`);
    
    const isExpense = isExpenseMessage(testCase);
    console.log(`  Es gasto: ${isExpense}`);
    
    if (isExpense) {
        const result = parseExpenseMessage(testCase);
        if (result) {
            console.log(`  ✅ Monto: $${result.amount}`);
            console.log(`  ✅ Descripcion: "${result.description}"`);
            console.log(`  ✅ Patron usado: ${result.pattern}`);
        } else {
            console.log(`  ❌ No se pudo parsear`);
        }
    }
    console.log('');
});

console.log('\n2. PRUEBAS DE MULTIPLES GASTOS:\n');

const multipleExpenses = [
    'gaste $300 en tacos y $50 en gasolina',
    'compre $200 de ropa, $80 en comida y pague $25 por uber',
    'tacos $45; cerveza $60; propina $20'
];

multipleExpenses.forEach((testCase, index) => {
    console.log(`Test Multiple ${index + 1}: "${testCase}"`);
    const results = parseMultipleExpenses(testCase);
    console.log(`  Gastos encontrados: ${results.length}`);
    results.forEach((result, i) => {
        console.log(`    ${i + 1}. $${result.amount} - ${result.description}`);
    });
    console.log('');
});

console.log('\n3. ESTADISTICAS DEL PARSER:\n');

const stats = getPatternStats();
console.log(`Total de patrones: ${stats.totalPatterns}`);
console.log(`Simbolos de moneda soportados: ${stats.currencySymbols.join(', ')}`);
console.log(`Keywords de gasto: ${stats.expenseKeywords}`);

console.log('\nPatrones disponibles:');
stats.patterns.forEach((pattern, index) => {
    console.log(`  ${index + 1}. ${pattern.name}`);
});

console.log('\n4. PRUEBAS DE RENDIMIENTO:\n');

const performanceTests = Array(1000).fill('gaste $300 en tacos del mercado');
const startTime = Date.now();

performanceTests.forEach(test => {
    parseExpenseMessage(test);
});

const endTime = Date.now();
console.log(`Tiempo para 1000 parseados: ${endTime - startTime}ms`);
console.log(`Promedio por mensaje: ${(endTime - startTime) / 1000}ms`);

console.log('\n=== FIN DE PRUEBAS ===');