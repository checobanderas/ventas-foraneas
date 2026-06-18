const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to MySQL host...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
  });

  try {
    // 1. Show databases
    const [dbRows] = await connection.query('SHOW DATABASES');
    const databases = dbRows.map(row => row.Database).filter(db => 
      !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db)
    );

    console.log('Available databases:', databases);

    for (const dbName of databases) {
      console.log(`\n--- Inspecting Database: ${dbName} ---`);
      await connection.query(`USE \`${dbName}\``);
      
      const [tableRows] = await connection.query('SHOW TABLES');
      const key = `Tables_in_${dbName}`;
      const tables = tableRows.map(row => row[key] || Object.values(row)[0]);
      console.log('Tables found:', tables);

      for (const tableName of tables) {
        console.log(`\n  Table: ${tableName}`);
        
        // Describe columns
        const [colRows] = await connection.query(`DESCRIBE \`${tableName}\``);
        console.log('  Columns:');
        colRows.forEach(col => {
          console.log(`    - ${col.Field} (${col.Type})`);
        });

        // Sample data
        const [dataRows] = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT 3`);
        console.log(`  Sample Data (Limit 3):`, JSON.stringify(dataRows, null, 2));
      }
    }
  } catch (err) {
    console.error('An error occurred during inspection:', err);
  } finally {
    await connection.end();
    console.log('\nConnection closed.');
  }
}

main();
