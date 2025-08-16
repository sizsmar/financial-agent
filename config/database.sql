-- Crea la base de datos
CREATE DATABASE financial_agent;

\c financial_agent;

-- Tabla de transacciones
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'otros',
    date TIMESTAMP DEFAULT NOW(),
    source VARCHAR(20) DEFAULT 'manual', -- 'manual', 'ocr', 'voice'
    raw_data TEXT, -- texto original, del ocr o voz transcrita
    user_phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updatet_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de categorias
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    keywords TEXT[], -- para la categorizacion
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de configuraciones de usuarios
CREATE TABLE user_config (
    id SERIAL PRIMARY KEY,
    user_phone VARCHAR(20) UNIQUE NOT NULL,
    daily_limit DECIMAL(10,2) DEFAULT 100.00,
    weekly_limit DECIMAL(10,2) DEFAULT 1000.00,
    monthly_limit DECIMAL(10,2) DEFAULT 10000.00,
    alert_thresholds JSONB DEFAULT '[70, 90]', -- [70%, 90%]
    timezone VARCHAR(50) DEFAULT 'America/Mexico_City',
    created_at TIMESTAMP DEFAULT NOW(),
    updadet_at TIMESTAMP DEFAULT NOW()
);

-- Categorias por defecto
INSERT INTO categories (name, keywords) VALUES  
('comida', ARRAY['restaurante', 'comida', 'tacos', 'delivery', 'rappi', 'ubereats']),
('transporte', ARRAY['uber', 'gasolina', 'taxi', 'camion', 'tren']),
('entretenimiento', ARRAY['cine', 'bar', 'antro', 'apple music', 'prime', 'hbo max']),
('compras', ARRAY['amazon', 'mercadolibre', 'ropa']),
('gastos_fijos', ARRAY['super', 'renta']),
('salud', ARRAY['dermatologo', 'dentista', 'medicina', 'farmacia', 'consulta']),
('servicios', ARRAY['luz', 'agua', 'internet', 'telefono']),
('otros', ARRAY[]);

CREATE INDEX idx_transactions_user_phone ON transactions(user_phone);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);