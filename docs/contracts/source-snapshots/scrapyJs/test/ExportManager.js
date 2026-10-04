// const fs = require('fs');
// const path = require('path');
  
// Test data with nested objects
const testItems = [
    { 
        title: 'Software Engineer', 
        company: { 
        name: 'Tech Innovators', 
        location: { city: 'San Francisco', country: 'USA' }
        },
        skills: ['JavaScript', 'Node.js', 'React'],
        experience: { years: 5, details: { projects: 10, clients: ['A', 'B', 'C'] } }
    },
    { 
        title: 'Product Designer', 
        company: { 
        name: 'Design Hub', 
        location: { city: 'New York', country: 'USA' }
        },
        skills: ['Sketch', 'Photoshop'],
        experience: { years: 3, details: { projects: 7, clients: ['X', 'Y'] } }
    }
];

// Flattened and converted output should handle nested data properly
ExportManager.export(testItems, 'nested_data.csv');
  