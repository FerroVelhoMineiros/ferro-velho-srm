/**
 * Storage Manager (API Version)
 * Handles data persistence communicating with Node.js Backend
 * Uses an in-memory cache for synchronous reads to preserve UI compatibility
 */

class StorageManager {
    constructor() {
        this.collections = ['vehicles', 'fuel', 'tires', 'parts', 'maintenance', 'drivers'];
        this.cache = {};
        this.apiUrl = 'http://localhost:3000/api';
    }

    // Load everything from API once on startup
    async loadAllData() {
        console.log("Loading data from PostgreSQL/API...");
        for (const collection of this.collections) {
            try {
                const res = await fetch(`${this.apiUrl}/${collection}`);
                if (res.ok) {
                    this.cache[collection] = await res.json();
                } else {
                    this.cache[collection] = [];
                }
            } catch (e) {
                console.error(`API offline ou erro no CORS. Coleção: ${collection}`, e);
                this.cache[collection] = [];
            }
        }
        console.log("Data loaded successfully!");
    }

    // Get all items from a collection (Returns from Cache synchronously)
    get(collection) {
        return this.cache[collection] || [];
    }

    // Get a specific item by ID
    getById(collection, id) {
        const items = this.get(collection);
        return items.find(item => item.id === id) || null;
    }

    // Add a new item
    add(collection, data) {
        // Optimistic UI Update (Immediate feedback)
        const tempId = 'temp_' + Date.now();
        const newItem = {
            id: tempId,
            createdAt: new Date().toISOString(),
            ...data
        };

        if (!this.cache[collection]) this.cache[collection] = [];
        this.cache[collection].push(newItem);

        // Async API Call
        fetch(`${this.apiUrl}/${collection}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(res => res.json())
            .then(savedItem => {
                // Replace optimistic data with real database data
                const idx = this.cache[collection].findIndex(i => i.id === tempId);
                if (idx !== -1) {
                    this.cache[collection][idx] = savedItem;
                }
            })
            .catch(e => console.error("Error saving to API", e));

        return newItem;
    }

    // Update an existing item
    update(collection, id, data) {
        // Optimistic UI Update
        const items = this.get(collection);
        const index = items.findIndex(item => item.id === id);

        if (index !== -1) {
            this.cache[collection][index] = {
                ...this.cache[collection][index],
                ...data,
                updatedAt: new Date().toISOString()
            };

            // Async API Call
            fetch(`${this.apiUrl}/${collection}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(e => console.error("Error updating API", e));

            return this.cache[collection][index];
        }
        return null;
    }

    // Delete an item
    delete(collection, id) {
        // Optimistic UI Update
        this.cache[collection] = this.cache[collection].filter(item => item.id !== id);

        // Async API Call
        fetch(`${this.apiUrl}/${collection}/${id}`, {
            method: 'DELETE'
        }).catch(e => console.error("Error deleting API", e));

        return true;
    }

    // Calculate total summary metrics
    getDashboardMetrics() {
        const vehicles = this.get('vehicles');
        const fuel = this.get('fuel');
        const tasks = this.get('maintenance');

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
    }
}

// Global instance
window.db = new StorageManager();
