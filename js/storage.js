/**
 * Storage Manager
 * Handles data persistence using localStorage
 */

class StorageManager {
    constructor() {
        this.collections = ['vehicles', 'fuel', 'tires', 'parts', 'maintenance', 'drivers'];
        this.initializeData();
    }

    // Ensure all collections exist in localStorage
    initializeData() {
        this.collections.forEach(collection => {
            if (!localStorage.getItem(`fc_${collection}`)) {
                localStorage.setItem(`fc_${collection}`, JSON.stringify([]));
            }
        });

        // Populate with some mock data if empty (for demonstration)
        this.seedMockData();
    }

    seedMockData() {
        const vehicles = this.get('vehicles');
        if (vehicles.length === 0) {
            this.add('vehicles', {
                plate: 'ABC-1234',
                model: 'Volkswagen Delivery 9.170',
                year: '2022',
                status: 'Ativo',
                mileage: 45000,
                type: 'Caminhão Leve'
            });
            this.add('vehicles', {
                plate: 'XYZ-9876',
                model: 'Mercedes-Benz Sprinter',
                year: '2021',
                status: 'Em Manutenção',
                mileage: 120500,
                type: 'Van'
            });
            this.add('vehicles', {
                plate: 'DEF-5678',
                model: 'Fiat Fiorino',
                year: '2023',
                status: 'Ativo',
                mileage: 12000,
                type: 'Furgão Base'
            });
        }

        const drivers = this.get('drivers');
        if (drivers.length === 0) {
            this.add('drivers', {
                name: 'João Silva',
                cnh: '12345678901',
                category: 'E',
                phone: '(11) 98765-4321',
                status: 'Ativo'
            });
            this.add('drivers', {
                name: 'Carlos Oliveira',
                cnh: '98765432109',
                category: 'D',
                phone: '(11) 91234-5678',
                status: 'Ativo'
            });
            this.add('drivers', {
                name: 'Ana Costa',
                cnh: '45678912300',
                category: 'B',
                phone: '(11) 99999-8888',
                status: 'Inativo'
            });
        }
    }

    // Get all items from a collection
    get(collection) {
        try {
            const data = localStorage.getItem(`fc_${collection}`);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error(`Error reading ${collection} from storage`, e);
            return [];
        }
    }

    // Get a specific item by ID
    getById(collection, id) {
        const items = this.get(collection);
        return items.find(item => item.id === id) || null;
    }

    // Add a new item to a collection
    add(collection, data) {
        const items = this.get(collection);
        const newItem = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            createdAt: new Date().toISOString(),
            ...data
        };
        items.push(newItem);
        this.save(collection, items);
        return newItem;
    }

    // Update an existing item
    update(collection, id, data) {
        const items = this.get(collection);
        const index = items.findIndex(item => item.id === id);

        if (index !== -1) {
            items[index] = { ...items[index], ...data, updatedAt: new Date().toISOString() };
            this.save(collection, items);
            return items[index];
        }
        return null;
    }

    // Delete an item
    delete(collection, id) {
        const items = this.get(collection);
        const filteredItems = items.filter(item => item.id !== id);
        this.save(collection, filteredItems);
        return true;
    }

    // Override collection directly
    save(collection, data) {
        localStorage.setItem(`fc_${collection}`, JSON.stringify(data));
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
        // Considerando agendamentos concluídos ou em andamento que preencheram o custo
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
