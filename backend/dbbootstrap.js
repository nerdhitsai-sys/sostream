/**
 * SOSTREAM - DATABASE BOOTSTRAPPER (ULTRA ADMIN EVO VERSION)
 * Arquitetura: PostgreSQL Direto com Suporte a Admin e CMS
 * Finalidade: Criação de Tabelas, Índices, Triggers e Inserção de Dados Reais
 * Focado em: Neon.tech / Supabase / PostgreSQL Local
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
});

async function bootstrap() {
    const client = await pool.connect();

    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║     🚀 SOSTREAM DATABASE BOOTSTRAPPER - ADMIN EVO     ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");

    try {
        console.log("📡 Conectando ao PostgreSQL (Neon.tech)...");
        console.log("✅ Conexão estabelecida com sucesso.\n");

        // ==========================================
        // 1. LIMPEZA TOTAL PARA REESTRUTURAÇÃO
        // ==========================================
        console.log("🧹 Limpando esquema anterior...");
        await client.query(`
            DROP TABLE IF EXISTS watch_history CASCADE;
            DROP TABLE IF EXISTS favorites CASCADE;
            DROP TABLE IF EXISTS episodes CASCADE;
            DROP TABLE IF EXISTS seasons CASCADE;
            DROP TABLE IF EXISTS media CASCADE;
            DROP TABLE IF EXISTS categories CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TYPE IF EXISTS media_type CASCADE;
        `);
        console.log("✅ Esquema limpo com sucesso.\n");

        // ==========================================
        // 2. CRIAÇÃO DE TIPOS ENUM
        // ==========================================
        console.log("🏗️ Criando tipos ENUM...");
        await client.query(`CREATE TYPE media_type AS ENUM ('movie', 'tv_show', 'anime');`);
        console.log("✅ Tipos ENUM criados.\n");

        // ==========================================
        // 3. ESTRUTURA DE TABELAS (CLEAN ARCHITECTURE READY)
        // ==========================================
        console.log("📦 Criando estrutura de tabelas...");

        // TABELA DE USUÁRIOS (COM SUPORTE ADMIN)
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar_url TEXT DEFAULT 'https://i.pravatar.cc/150?u=sostream',
                is_premium BOOLEAN DEFAULT false,
                is_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE CATEGORIAS
        await client.query(`
            CREATE TABLE categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(50) NOT NULL,
                slug VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE MÍDIA (FILMES/SÉRIES/ANIMES)
        await client.query(`
            CREATE TABLE media (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                poster_url TEXT,
                banner_url TEXT,
                type media_type NOT NULL,
                rating VARCHAR(10),
                release_year INTEGER,
                category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
                is_trending BOOLEAN DEFAULT false,
                cast_list JSONB DEFAULT '[]',
                average_rating DECIMAL(3,1) DEFAULT 0.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE TEMPORADAS
        await client.query(`
            CREATE TABLE seasons (
                id SERIAL PRIMARY KEY,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                season_number INTEGER NOT NULL,
                title VARCHAR(100),
                UNIQUE(media_id, season_number)
            );
        `);

        // TABELA DE EPISÓDIOS
        await client.query(`
            CREATE TABLE episodes (
                id SERIAL PRIMARY KEY,
                season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
                episode_number INTEGER NOT NULL,
                title VARCHAR(255) NOT NULL,
                synopsis TEXT,
                duration_minutes INTEGER,
                video_url TEXT,
                thumbnail_url TEXT,
                is_free BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // TABELA DE FAVORITOS
        await client.query(`
            CREATE TABLE favorites (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, media_id)
            );
        `);

        // TABELA DE HISTÓRICO (CONTINUE ASSISTINDO)
        await client.query(`
            CREATE TABLE watch_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
                progress_seconds INTEGER DEFAULT 0,
                total_seconds INTEGER DEFAULT 0,
                last_watched TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, episode_id)
            );
        `);

        console.log("✅ Tabelas criadas com sucesso.\n");

        // ==========================================
        // 4. CRIAÇÃO DE ÍNDICES PARA PERFORMANCE
        // ==========================================
        console.log("⚡ Otimizando com índices...");
        await client.query(`CREATE INDEX idx_media_category ON media(category_id);`);
        await client.query(`CREATE INDEX idx_media_trending ON media(is_trending) WHERE is_trending = true;`);
        await client.query(`CREATE INDEX idx_episodes_season ON episodes(season_id);`);
        await client.query(`CREATE INDEX idx_users_email ON users(email);`);
        await client.query(`CREATE INDEX idx_watch_history_user ON watch_history(user_id, last_watched DESC);`);
        await client.query(`CREATE INDEX idx_favorites_user ON favorites(user_id);`);
        console.log("✅ Índices criados com sucesso.\n");

        // ==========================================
        // 5. INSERÇÃO DE DADOS (SEEDING COMPLETO)
        // ==========================================
        console.log("🌱 Inserindo dados de semente (Seeding)...");

        // 5.1 Categorias
        console.log("   📁 Inserindo categorias...");
        const catRes = await client.query(`
            INSERT INTO categories (name, slug, description) VALUES
            ('Ação', 'acao', 'Filmes e séries cheios de adrenalina e cenas intensas'),
            ('Fantasia', 'fantasia', 'Mundos mágicos e criaturas fantásticas'),
            ('Drama', 'drama', 'Histórias emocionantes e personagens profundos'),
            ('Animação', 'animacao', 'Desenhos animados e animações para todas as idades'),
            ('Ficção Científica', 'sci-fi', 'Futuro distópico, tecnologia e ficção científica'),
            ('Terror', 'terror', 'Suspense e horror para os mais corajosos')
            RETURNING id, name;
        `);
        const catMap = {};
        catRes.rows.forEach(r => catMap[r.name] = r.id);

        // 5.2 Usuário Administrador Mestre
        console.log("   👑 Criando Administrador Mestre...");
        const adminPass = await bcrypt.hash('sostream123', 12);
        await client.query(`
            INSERT INTO users (name, email, password_hash, is_premium, is_admin, avatar_url)
            VALUES (
                'Admin Sostream',
                'admin@sostream.com',
                '${adminPass}',
                true,
                true,
                'https://i.pravatar.cc/150?u=admin'
            );
        `);

        // 5.3 Usuário Premium Teste
        console.log("   👤 Criando usuário premium de teste...");
        const userPass = await bcrypt.hash('teste123', 12);
        await client.query(`
            INSERT INTO users (name, email, password_hash, is_premium, is_admin, avatar_url)
            VALUES (
                'Timur K.',
                'timur@sostream.com',
                '${userPass}',
                true,
                false,
                'https://i.pravatar.cc/150?u=timur'
            );
        `);

        // 5.4 Usuário Free Teste
        console.log("   👤 Criando usuário free de teste...");
        const freePass = await bcrypt.hash('free123', 12);
        await client.query(`
            INSERT INTO users (name, email, password_hash, is_premium, is_admin, avatar_url)
            VALUES (
                'João Silva',
                'joao@email.com',
                '${freePass}',
                false,
                false,
                'https://i.pravatar.cc/150?u=joao'
            );
        `);

        // 5.5 Conteúdo Principal: Arcane
        console.log("   🎬 Inserindo conteúdo principal: Arcane...");
        const arcaneRes = await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, average_rating)
            VALUES (
                'Arcane',
                'Em meio ao conflito entre as cidades de Piltover e Zaun, duas irmãs lutam em lados opostos de uma guerra entre tecnologias mágicas e convicções incompatíveis.',
                'https://m.media-amazon.com/images/M/MV5BYmU1ZWY3NzMtMGY1MS00NjRlLWE2NDgtYzk5YTAzZWY2ZTVlXkEyXkFqcGdeQXVyMTEyMjM2NDc2._V1_FMjpg_UX1000_.jpg',
                'https://images.alphacoders.com/119/1190454.jpg',
                'tv_show', '16+', 2021, ${catMap['Animação']}, true,
                '[{"name": "Hailee Steinfeld", "role": "Vi"}, {"name": "Ella Purnell", "role": "Jinx"}, {"name": "Kevin Alejandro", "role": "Jayce"}]',
                9.5
            ) RETURNING id;
        `);
        const arcaneId = arcaneRes.rows[0].id;

        // Temporada 1 de Arcane
        const s1Res = await client.query(`
            INSERT INTO seasons (media_id, season_number, title)
            VALUES (${arcaneId}, 1, 'Temporada 1: Piltover vs Zaun') RETURNING id;
        `);
        const s1Id = s1Res.rows[0].id;

        // Episódios de Arcane (S01)
        await client.query(`
            INSERT INTO episodes (season_id, episode_number, title, synopsis, duration_minutes, video_url, thumbnail_url, is_free)
            VALUES
            (${s1Id}, 1, 'Welcome to the Playground', 'As irmãs órfãs Vi e Powder causam confusão nas ruas de Piltover enquanto buscam sobreviver.', 42, 'https://cdn.sostream.com/arcane/s1e1.mp4', 'https://images.alphacoders.com/119/1190454.jpg', true),
            (${s1Id}, 2, 'Some Mysteries Are Better Left Unsolved', 'Jayce testa uma tecnologia perigosa enquanto a tensão em Zaun aumenta e segredos são revelados.', 40, 'https://cdn.sostream.com/arcane/s1e2.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 3, 'The Base Violence Necessary for Change', 'Um confronto épico muda o destino das irmãs para sempre, desencadeando eventos catastróficos.', 45, 'https://cdn.sostream.com/arcane/s1e3.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 4, 'Happy Progress Day!', 'Anos após a tragédia, Piltover celebra seu Progress Day enquanto Zaun enfrenta novas ameaças.', 43, 'https://cdn.sostream.com/arcane/s1e4.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 5, 'Everybody Wants to Be My Enemy', 'Alianças são testadas e novas inimizades surgem enquanto a guerra se aproxima.', 41, 'https://cdn.sostream.com/arcane/s1e5.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 6, 'When These Walls Come Tumbling Down', 'Segredos do passado vêm à tona, abalando as estruturas de ambas as cidades.', 44, 'https://cdn.sostream.com/arcane/s1e6.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 7, 'The Boy Savior', 'Um herói improvável surge enquanto as tensões atingem seu ponto crítico.', 42, 'https://cdn.sostream.com/arcane/s1e7.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 8, 'Oil and Water', 'Conflitos pessoais e políticos se misturam em uma mistura explosiva.', 43, 'https://cdn.sostream.com/arcane/s1e8.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false),
            (${s1Id}, 9, 'The Monster You Created', 'O confronto final entre irmãs decide o futuro de Piltover e Zaun.', 50, 'https://cdn.sostream.com/arcane/s1e9.mp4', 'https://images.alphacoders.com/119/1190454.jpg', false);
        `);

        // 5.6 Filmes em Alta
        console.log("   🎬 Inserindo filmes populares...");
        await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, average_rating)
            VALUES
            ('Joker', 'Arthur Fleck, um comediante fracassado, é desprezado pela sociedade e embarca em uma espiral descendente de revolta.', 'https://m.media-amazon.com/images/M/MV5BNGVjNWI4ZGUtNzE0MS00YTJmLWE0ZDctN2ZiYTk2YmI3NTYyXkEyXkFqcGdeQXVyMTkxNjUyNQ@@._V1_.jpg', 'https://wallpapercave.com/wp/wp4675541.jpg', 'movie', '18+', 2019, ${catMap['Drama']}, true, '[{"name": "Joaquin Phoenix", "role": "Arthur Fleck/Joker"}]', 8.7),
            ('Duna: Parte 2', 'Paul Atreides une-se com Chani e os Fremen enquanto busca vingança contra os conspiradores que destruíram sua família.', 'https://m.media-amazon.com/images/M/MV5BN2QyZGU4ZDctOWMzMy00NTc5LThlOGQtODhmNDI1YjE5YTVlXkEyXkFqcGdeQXVyMDM2NDM2MQ@@._V1_.jpg', 'https://wallpapercave.com/wp/wp12893088.jpg', 'movie', '14+', 2024, ${catMap['Ficção Científica']}, true, '[{"name": "Timothée Chalamet", "role": "Paul Atreides"}, {"name": "Zendaya", "role": "Chani"}]', 8.9),
            ('Oppenheimer', 'A história do físico J. Robert Oppenheimer e seu papel no desenvolvimento da bomba atômica.', 'https://m.media-amazon.com/images/M/MV5BMDBmYTZjNjUtN2M1MS00MTQ2LTk2ODgtNzc2M2QyZGE5NTVjXkEyXkFqcGdeQXVyNzAwMjU2MTY@._V1_.jpg', 'https://wallpapercave.com/wp/wp12540654.jpg', 'movie', '16+', 2023, ${catMap['Drama']}, true, '[{"name": "Cillian Murphy", "role": "J. Robert Oppenheimer"}]', 8.5),
            ('The Batman', 'Batman explora a corrupção em Gotham enquanto enfrenta o Charada, um serial killer que deixa pistas enigmáticas.', 'https://m.media-amazon.com/images/M/MV5BMmU5MjJlYzgtNWYzOC00ZjJhLTk0NGQtZjUxZGEwMjU0NzVlXkEyXkFqcGdeQXVyNjY1MTg4Mzc@._V1_.jpg', 'https://wallpapercave.com/wp/wp10334071.jpg', 'movie', '14+', 2022, ${catMap['Ação']}, true, '[{"name": "Robert Pattinson", "role": "Bruce Wayne/Batman"}]', 8.4);
        `);

        // 5.7 Séries Populares
        console.log("   📺 Inserindo séries populares...");
        const seriesRes = await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, average_rating)
            VALUES
            ('The Last of Us', 'Em um mundo pós-apocalíptico, Joel deve proteger a jovem Ellie, que pode ser a chave para a cura da humanidade.', 'https://m.media-amazon.com/images/M/MV5BZGUzYTI3M2EtZmM0Yy00NGUyLWI4ODEtN2Q3ZGJlYzhhZjU3XkEyXkFqcGdeQXVyNTM0OTY1OQ@@._V1_.jpg', 'https://wallpapercave.com/wp/wp11722010.jpg', 'tv_show', '18+', 2023, ${catMap['Drama']}, true, '[{"name": "Pedro Pascal", "role": "Joel"}, {"name": "Bella Ramsey", "role": "Ellie"}]', 8.8)
            RETURNING id;
        `);

        // 5.8 Animes Populares
        console.log("   🎌 Inserindo animes populares...");
        await client.query(`
            INSERT INTO media (title, synopsis, poster_url, banner_url, type, rating, release_year, category_id, is_trending, cast_list, average_rating)
            VALUES
            ('One Piece', 'Monkey D. Luffy e sua tripulação navegam pelos mares em busca do tesouro lendário One Piece.', 'https://m.media-amazon.com/images/M/MV5BODcwNWE3OTMtMDc3MS00NDFjLWE1OTAtNDU3NjgxODMxY2UyXkEyXkFqcGdeQXVyNTAyODkwOQ@@._V1_.jpg', 'https://wallpapercave.com/wp/wp10789997.jpg', 'anime', '12+', 1999, ${catMap['Animação']}, true, '[{"name": "Mayumi Tanaka", "role": "Monkey D. Luffy"}]', 9.0),
            ('Jujutsu Kaisen', 'Yuji Itadori se torna hospedeiro de uma poderosa maldição e entra no mundo da feitiçaria.', 'https://m.media-amazon.com/images/M/MV5BZmQ1N2U4MTUtYjM5Zi00MTVlLThhMmYtNjg4YmQ4Y2U0ZTkyXkEyXkFqcGdeQXVyNjAwNDUxODI@._V1_.jpg', 'https://wallpapercave.com/wp/wp7433903.jpg', 'anime', '16+', 2020, ${catMap['Animação']}, true, '[{"name": "Junya Enoki", "role": "Yuji Itadori"}]', 8.6);
        `);

        // 5.9 Histórico de exemplo
        console.log("   📊 Inserindo histórico de exemplo...");
        const timurUser = await client.query(`SELECT id FROM users WHERE email = 'timur@sostream.com'`);
        const joaoUser = await client.query(`SELECT id FROM users WHERE email = 'joao@email.com'`);
        const episodes = await client.query(`SELECT id FROM episodes LIMIT 2`);

        if (timurUser.rows[0] && episodes.rows.length > 0) {
            await client.query(`
                INSERT INTO watch_history (user_id, episode_id, progress_seconds, total_seconds, last_watched)
                VALUES
                (${timurUser.rows[0].id}, ${episodes.rows[0].id}, 1250, 2520, NOW()),
                (${timurUser.rows[0].id}, ${episodes.rows[1].id}, 340, 2400, NOW());
            `);
        }

        if (joaoUser.rows[0] && episodes.rows[0]) {
            await client.query(`
                INSERT INTO watch_history (user_id, episode_id, progress_seconds, total_seconds, last_watched)
                VALUES (${joaoUser.rows[0].id}, ${episodes.rows[0].id}, 1800, 2520, NOW());
            `);
        }

        console.log("\n╔════════════════════════════════════════════════════════╗");
        console.log("║     ✅ BOOTSTRAP CONCLUÍDO COM SUCESSO!              ║");
        console.log("╚════════════════════════════════════════════════════════╝\n");

        console.log("📊 RESUMO DO BANCO DE DADOS:");
        console.log("   • Usuários: 3 (1 Admin, 1 Premium, 1 Free)");
        console.log("   • Categorias: 6");
        console.log("   • Mídias: 7 (1 Série, 4 Filmes, 1 Série Live-action, 2 Animes)");
        console.log("   • Temporadas: 1");
        console.log("   • Episódios: 9");
        console.log("   • Favoritos: 0");
        console.log("   • Histórico: 3 registros\n");

        console.log("🔑 CREDENCIAIS DE ACESSO:");
        console.log("   • Admin: admin@sostream.com / sostream123");
        console.log("   • Premium: timur@sostream.com / teste123");
        console.log("   • Free: joao@email.com / free123\n");

        console.log("🎬 CONTEÚDO DISPONÍVEL:");
        console.log("   • Arcane (Série) - 9 episódios - 1 grátis, 8 premium");
        console.log("   • Joker (Filme) - Premium");
        console.log("   • Duna: Parte 2 (Filme) - Premium");
        console.log("   • Oppenheimer (Filme) - Premium");
        console.log("   • The Batman (Filme) - Premium");
        console.log("   • The Last of Us (Série) - Premium");
        console.log("   • One Piece (Anime) - Premium");
        console.log("   • Jujutsu Kaisen (Anime) - Premium\n");

        console.log("✨ O servidor SOSTREAM está pronto para ser iniciado!");
        console.log("   Execute: node server.js\n");

    } catch (err) {
        console.error("\n❌ ERRO NO BOOTSTRAP:");
        console.error("   Mensagem:", err.message);
        console.error("   Stack:", err.stack);
        console.error("\n   Verifique sua string de conexão DATABASE_URL no arquivo .env");
        console.error("   Certifique-se de que o banco de dados está acessível.\n");
    } finally {
        client.release();
        await pool.end();
        console.log("🔌 Conexão com o banco de dados encerrada.\n");
    }
}

// Executar bootstrap
bootstrap();
