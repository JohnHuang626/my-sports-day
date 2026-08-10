// ... existing code ...
// --- 報名表列印 (全新加入的功能) ---
function PrintRegistration({ config, results }: any) {
  if (!config) return null;
  // 只印出個人賽
  const individualEvents = config.events.filter((e: any) => e.type === 'individual');

  return (
    <div className="hidden print:block bg-white text-black">
      {[7, 8, 9].map((grade, index) => {
        const gradeClasses = config.classes.filter((c: any) => c.grade === grade);
        return (
          <div key={grade} className={`p-8 ${index > 0 ? 'break-before-page' : ''}`}>
            <h1 className="text-3xl font-bold text-center mb-8">嘉新國中運動會 - {grade} 年級 個人賽報名名單</h1>
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              {individualEvents.map((event: any) => (
                <div key={event.id} className="border border-gray-400 p-3 rounded break-inside-avoid shadow-sm">
                  <h3 className="font-bold text-lg mb-2 bg-gray-100 p-1 text-center">{getEventDisplayName(event)}</h3>
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {gradeClasses.map((c: any) => {
                        const entries = results[event.id]?.[c.id] || [];
                        const names = entries.map((e: any) => e.studentName).filter(Boolean); // 過濾掉空字串
                        
                        // 如果該班級沒報名，留空白或顯示尚未報名
                        const nameString = names.length > 0 ? names.join('、') : '';
                        
                        return (
                          <tr key={c.id} className="border-b border-gray-200 last:border-0">
                            <td className="p-1.5 font-bold w-16 text-center border-r bg-gray-50">{c.name}</td>
                            <td className="p-1.5 pl-3">{nameString}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}