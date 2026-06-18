const mysql = require('mysql2/promise');

async function main() {
  console.log('Connecting to MySQL host to search for clientes tables...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
  });

  try {
    const [dbRows] = await connection.query('SHOW DATABASES');
    const databases = dbRows.map(row => row.Database).filter(db => 
      !['information_schema', 'mysql', 'performance_schema', 'sys', 'phpmyadmin', 'horde'].includes(db)
    );

    console.log(`Searching for 'clientes' table in ${databases.length} databases...`);

    for (const dbName of databases) {
      try {
        await connection.query(`USE \`${dbName}\``);
        const [tableRows] = await connection.query(`SHOW TABLES LIKE 'clientes'`);
        if (tableRows.length > 0) {
          const [countRows] = await connection.query('SELECT COUNT(*) as cnt FROM `clientes`');
          const count = countRows[0].cnt;
          
          console.log(`\n====================================================`);
          console.log(`Database: ${dbName} | Table: clientes | Row Count: ${count}`);
          console.log(`====================================================`);
          
          if (count > 0) {
            const [cols] = await connection.query('DESCRIBE `clientes`');
            console.log('Columns:');
            cols.forEach(c => {
              console.log(`  - ${c.Field} (${c.Type})`);
            });
            
            const [samples] = await connection.query('SELECT * FROM `clientes` LIMIT 2');
            console.log('Sample Data:', JSON.stringify(samples, null, 2));
          }
        }
      } catch (err) {
        // Skip databases where we don't have access or syntax fails
      }
    }
  } catch (err) {
    console.error('Error during search:', err);
  } finally {
    await connection.end();
    console.log('\nSearch completed.');
  }
}

main();
