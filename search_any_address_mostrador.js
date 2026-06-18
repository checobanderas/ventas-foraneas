import mysql from 'mysql2/promise';

async function main() {
  console.log('Searching for any populated address columns in mostrador12025 database...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'mostrador12025'
  });

  try {
    const [tableRows] = await connection.query('SHOW TABLES');
    const tables = tableRows.map(row => Object.values(row)[0]);

    for (const tableName of tables) {
      try {
        const [cols] = await connection.query(`DESCRIBE \`${tableName}\``);
        
        // Look for text columns
        const textCols = cols.filter(c => 
          c.Type.includes('varchar') || c.Type.includes('text') || c.Type.includes('char')
        ).map(c => c.Field);

        if (textCols.length > 0) {
          // Check if any row in this table has a value containing common address keywords
          // like 'calle', 'colonia', 'centro', 'av', 'ave', 'lote', 'mza'
          const conditions = textCols.map(col => `(\`${col}\` LIKE '%calle%' OR \`${col}\` LIKE '%colonia%' OR \`${col}\` LIKE '%centro%' OR \`${col}\` LIKE '%av.%' OR \`${col}\` LIKE '%avenida%')`).join(' OR ');
          
          const [matches] = await connection.query(`
            SELECT * FROM \`${tableName}\` 
            WHERE ${conditions}
            LIMIT 3
          `);

          if (matches.length > 0) {
            console.log(`\n[Potential Address Match] Table: ${tableName} | Matching Rows: ${matches.length}`);
            console.log(JSON.stringify(matches, null, 2));
          }
        }
      } catch (tErr) {
        // Skip individual table errors
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.end();
    console.log('Scan complete.');
  }
}

main();
