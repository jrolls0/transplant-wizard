import { Pool, PoolConfig } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import logger from './logger';

class DatabaseConfig {
  private pool: Pool;
  private static instance: DatabaseConfig;

  private constructor() {
    const config: PoolConfig = {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      min: parseInt(process.env.DB_POOL_MIN || '2'),
      max: parseInt(process.env.DB_POOL_MAX || '10'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Log pool connection
    this.pool.on('connect', (client) => {
      logger.info('Database client connected');
    });
  }

  public static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Executed query', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rows: result.rowCount
      });
      
      return result;
    } catch (error) {
      logger.error('Database query error', {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    } finally {
      client.release();
    }
  }

  public async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW() as now, version() as version');
      logger.info('Database connection successful', {
        time: result.rows[0].now,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]
      });
      return true;
    } catch (error) {
      logger.error('Database connection failed', error);
      return false;
    }
  }

  public async initializeDatabase(): Promise<void> {
    try {
      logger.info('Starting database initialization...');
      
      // Check if database exists and is accessible
      const connectionSuccessful = await this.testConnection();
      if (!connectionSuccessful) {
        throw new Error('Cannot connect to database');
      }

      // Check if tables exist
      const tablesExist = await this.checkTablesExist();
      
      if (!tablesExist) {
        logger.info('Tables do not exist, creating schema...');
        await this.createSchema();
        await this.seedData();
      } else {
        logger.info('Database tables already exist, skipping schema creation');
      }

      logger.info('Database initialization completed successfully');
    } catch (error) {
      logger.error('Database initialization failed', error);
      throw error;
    }
  }

  private async checkTablesExist(): Promise<boolean> {
    try {
      const result = await this.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('users', 'patients', 'social_workers', 'dialysis_clinics')
      `);
      
      return parseInt(result.rows[0].count) >= 4;
    } catch (error) {
      logger.error('Error checking if tables exist', error);
      return false;
    }
  }

  private async createSchema(): Promise<void> {
    try {
      const schemaPath = join(__dirname, '../../database/schema.sql');
      const schemaSql = readFileSync(schemaPath, 'utf8');
      
      // Execute schema creation
      await this.query(schemaSql);
      logger.info('Database schema created successfully');
    } catch (error) {
      logger.error('Error creating database schema', error);
      throw error;
    }
  }

  private async seedData(): Promise<void> {
    try {
      const seedPath = join(__dirname, '../../database/seed-data.sql');
      const seedSql = readFileSync(seedPath, 'utf8');
      
      // Execute seed data insertion
      await this.query(seedSql);
      logger.info('Database seed data inserted successfully');
    } catch (error) {
      logger.error('Error seeding database', error);
      throw error;
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }
}

export default DatabaseConfig;