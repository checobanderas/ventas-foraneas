const mysql = require('mysql2/promise');

async function main() {
  console.log('Scanning all databases for client tables with populated addresses...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
  });

  try {
    const [dbRows] = await connection.query('SHOW DATABASES');
    const databases = dbRows.map(row => row.Database).filter(db => 
      !['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin', 'horde', 'roundcubemail'].includes(db)
    );

    for (const dbName of databases) {
      try {
        await connection.query(`USE \`${dbName}\``);
        const [tableRows] = await connection.query('SHOW TABLES');
        
        for (const tRow of tableRows) {
          const tableName = Object.values(tRow)[0];
          
          // Look for any table containing "cliente"
          if (tableName.toLowerCase().includes('client')) {
            const [cols] = await connection.query(`DESCRIBE \`${tableName}\``);
            const colNames = cols.map(c => c.Field.toLowerCase());
            
            // Check if there are address columns
            const addrCols = colNames.filter(name => 
              ['calle', 'direccion', 'colonia', 'poblacion', 'domfiscal', 'localidad', 'ciudad'].some(k => name.includes(k))
            );
            
            if (addrCols.length > 0) {
              const [countRows] = await connection.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
              const total = countRows[0].cnt;
              
              if (total > 0) {
                // Build a dynamic query to check for non-empty address fields
                const checkConditions = addrCols.map(col => `(\`${col}\` IS NOT NULL AND TRIM(\`${col}\`) != '' AND TRIM(\`${col}\`) != '.' AND TRIM(\`${col}\`) != 'SIN CALLE')`).join(' OR ');
                
                const [nonEmptyRows] = await connection.query(`
                  SELECT COUNT(*) as cnt FROM \`${tableName}\` 
                  WHERE ${checkConditions}
                `);
                
                const populated = nonEmptyRows[0].cnt;
                
                console.log(`Database: ${dbName} | Table: ${tableName} | Total Rows: ${total} | Populated Addresses: ${populated} | Match Columns: ${addrCols.join(', ')}`);
                
                if (populated > 0) {
                  const [samples] = await connection.query(`SELECT NOMBRE, ${addrCols.join(', ')} FROM \`${tableName}\` WHERE ${checkConditions} LIMIT 2`);
                  console.log(`  Sample:`, JSON.stringify(samples, null, 2));
                }
              }
            }
          }
        }
      } catch (err) {
        // Skip errors
      }
    }
  } catch (err) {
    console.error('Error during scan:', err);
  } finally {
    await connection.end();
    console.log('Scan complete.');
  }
}

main();
