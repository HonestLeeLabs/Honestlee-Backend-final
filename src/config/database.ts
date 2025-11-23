import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export type Region = 'ae' | 'th' | 'in' | 'global';

interface DatabaseConnections {
  ae: mongoose.Connection | null;
  th: mongoose.Connection | null;
  in: mongoose.Connection | null;
  shared: mongoose.Connection;
}

class DatabaseManager {
  private connections: DatabaseConnections = {
    ae: null,
    th: null,
    in: null,
    shared: mongoose.connection
  };

  private connectionPromises: Map<Region, Promise<mongoose.Connection>> = new Map();

  async connectShared(): Promise<mongoose.Connection> {
    const sharedURI = process.env.MONGODB_URI_SHARED || process.env.MONGODB_URI;
    
    if (!sharedURI) {
      throw new Error('MONGODB_URI_SHARED is not defined');
    }

    if (this.connections.shared.readyState === 1) {
      return this.connections.shared;
    }

    // ⭐ UPDATED: Increased timeouts for long-running operations
    await mongoose.connect(sharedURI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 180000,        // ⭐ Changed from 45000 to 180000 (3 minutes)
      connectTimeoutMS: 30000,
      maxPoolSize: 50,                // ⭐ Added
      minPoolSize: 10,                // ⭐ Added
      maxIdleTimeMS: 60000,           // ⭐ Added
      heartbeatFrequencyMS: 10000,    // ⭐ Added
    });

    console.log('✅ Shared database connected:', mongoose.connection.name);
    return this.connections.shared;
  }

  async connectRegion(region: Region): Promise<mongoose.Connection> {
    if (region === 'global') {
      return this.connectShared();
    }

    // Check if already connected
    if (this.connections[region]?.readyState === 1) {
      return this.connections[region]!;
    }

    // Check if connection is in progress
    if (this.connectionPromises.has(region)) {
      return this.connectionPromises.get(region)!;
    }

    // Create new connection
    const connectionPromise = this.createRegionalConnection(region);
    this.connectionPromises.set(region, connectionPromise);

    try {
      const connection = await connectionPromise;
      this.connections[region] = connection;
      this.connectionPromises.delete(region);
      return connection;
    } catch (error) {
      this.connectionPromises.delete(region);
      throw error;
    }
  }

  private async createRegionalConnection(region: Region): Promise<mongoose.Connection> {
    const uriKey = `MONGODB_URI_${region.toUpperCase()}`;
    const uri = process.env[uriKey];

    if (!uri) {
      throw new Error(`${uriKey} is not defined in environment variables`);
    }

    // ⭐ UPDATED: Increased timeouts for long-running operations
    const connection = mongoose.createConnection(uri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 180000,        // ⭐ Changed from 45000 to 180000 (3 minutes)
      connectTimeoutMS: 30000,
      maxPoolSize: 50,                // ⭐ Added
      minPoolSize: 10,                // ⭐ Added
      maxIdleTimeMS: 60000,           // ⭐ Added
      heartbeatFrequencyMS: 10000,    // ⭐ Added
    });

    await connection.asPromise();

    console.log(`✅ ${region.toUpperCase()} database connected:`, connection.name);
    return connection;
  }

  getConnection(region: Region): mongoose.Connection {
    if (region === 'global') {
      return this.connections.shared;
    }

    const connection = this.connections[region];
    if (!connection || connection.readyState !== 1) {
      throw new Error(`Database connection for region ${region} is not available`);
    }

    return connection;
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [region, connection] of Object.entries(this.connections)) {
      if (connection && connection.readyState === 1) {
        promises.push(connection.close());
      }
    }

    await Promise.all(promises);
    console.log('✅ All database connections closed');
  }
}

export const dbManager = new DatabaseManager();

// Helper to get regional model
export function getRegionalModel<T>(
  modelName: string,
  schema: mongoose.Schema,
  region: Region
): mongoose.Model<T> {
  const connection = dbManager.getConnection(region);
  return connection.model<T>(modelName, schema);
}
