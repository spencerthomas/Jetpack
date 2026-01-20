const fs = require('fs');
const content = fs.readFileSync('.beads/tasks.jsonl', 'utf8');
const lines = content.split('\n').filter(l => l.trim());

let resetCount = 0;
const fixed = lines.map(line => {
  try {
    const task = JSON.parse(line);
    // Reset stuck/failed tasks back to ready
    if (['in_progress', 'claimed', 'failed'].includes(task.status)) {
      task.status = 'ready';
      task.assignedAgent = null;
      task.retryCount = (task.retryCount || 0);
      resetCount++;
    }
    // Ensure required fields
    if (!task.blockers) task.blockers = [];
    if (!task.dependencies) task.dependencies = [];
    return JSON.stringify(task);
  } catch (e) { return line; }
});

fs.writeFileSync('.beads/tasks.jsonl', fixed.join('\n') + '\n');
console.log('Reset', resetCount, 'stuck tasks to ready status');
console.log('Total tasks:', fixed.length);
