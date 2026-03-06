/**
 * Storage Manager
 * Handles data persistence using the backend Node API connected to PostgreSQL
 */

class StorageManager {
    constructor() {
        this.collections = ['vehicles', 'fuel', 'tires', 'parts', 'maintenance', 'drivers'];
        // Define base URL for local or production
        const origin = window.location.origin;
        this.baseUrl = (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('file://') || window.location.protocol === 'file:') 
            ? 'http://localhost:3000' 
            : '';
    }

    // Get all items from a collection
    async get(collection) {
        try {
            // Use no-store cache or cache-busting so the UI always gets fresh data
            const response = await fetch(`${this.baseUrl}/api/${collection}?v=${Date.now()}`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Failed to fetch ${collection}`);
            return await response.json();
        } catch (e) {
            console.error(`Error reading ${collection} from API`, e);
            return [];
        }
    }

    // Get a specific item by ID
    async getById(collection, id) {
        try {
            const response = await fetch(`${this.baseUrl}/api/${collection}/${id}?v=${Date.now()}`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Failed to fetch ${collection} item ${id}`);
            return await response.json();
        } catch (e) {
            console.error(`Error reading ${collection} item from API`, e);
            return null;
        }
    }

    // Add a new item to a collection
    async add(collection, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/${collection}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Failed to add to ${collection}`);
            return await response.json();
        } catch (e) {
            console.error(`Error adding to ${collection}`, e);
            throw e;
        }
    }

    // Update an existing item
    async update(collection, id, data) {
        try {
            const response = await fetch(`${this.baseUrl}/api/${collection}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Failed to update ${collection} item ${id}`);
            return await response.json();
        } catch (e) {
            console.error(`Error updating ${collection}`, e);
            throw e;
        }
    }

    // Delete an item
    async delete(collection, id) {
        try {
            const response = await fetch(`${this.baseUrl}/api/${collection}/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error(`Failed to delete ${collection} item ${id}`);
            return true;
        } catch (e) {
            console.error(`Error deleting from ${collection}`, e);
            throw e;
        }
    }

    // Save completely overrides a collection (Not recommended for API, keeping for compatibility if ever needed)
    async save(collection, data) {
        console.warn('save() is deprecated. Please use add(), update(), or delete() instead.');
    }

    // Calculate total summary metrics
    async getDashboardMetrics() {
        try {
            const [vehicles, fuel, tasks] = await Promise.all([
                this.get('vehicles'),
                this.get('fuel'),
                this.get('maintenance')
            ]);
            
            const activeVehicles = vehicles.filter(v => v.status === 'Ativo').length;
            const maintenanceVehicles = vehicles.filter(v => v.status === 'Em Manutenção').length;

            const pendingTasks = tasks.filter(t => t.status === 'Pendente').length;

            const totalFuelCost = fuel.reduce((acc, curr) => acc + (Number(curr.totalCost) || 0), 0);
            const totalMaintenanceCost = tasks.reduce((acc, curr) => acc + (Number(curr.cost) || 0), 0);

            return {
                totalVehicles: vehicles.length,
                activeVehicles,
                maintenanceVehicles,
                pendingTasks,
                totalFuelCost,
                totalMaintenanceCost
            };
        } catch (e) {
            console.error('Error fetching dashboard metrics', e);
            return {
                totalVehicles: 0,
                activeVehicles: 0,
                maintenanceVehicles: 0,
                pendingTasks: 0,
                totalFuelCost: 0,
                totalMaintenanceCost: 0
            };
        }
    }
}

// Global instance
window.db = new StorageManager();
