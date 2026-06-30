#!/bin/bash
# Add "Graduate to Alumni" button to TeacherClassPage.jsx student popup

FILE=/root/Teacher-s-App-frontent/src/pages/TeacherClassPage.jsx

# Check if already added
if grep -q 'Graduate to Alumni' "$FILE"; then
  echo "Already added"
  exit 0
fi

# Add state for graduation
sed -i 's/const \[showQuizModal, setShowQuizModal\] = useState(false);/const [showQuizModal, setShowQuizModal] = useState(false);\n  const [graduating, setGraduating] = useState(false);/' "$FILE"

# Add graduation handler before the return statement
sed -i '/const popJoined = selectedStudent.joined_at/i\\n  const handleGraduate = async () => {\n    if (!window.confirm(`Graduate ${popName} to alumni? They will gain access to the alumni platform.`)) return;\n    setGraduating(true);\n    try {\n      await api.post("\/alumni\/graduate", { student_id: selectedStudent.id, graduation_year: new Date().getFullYear() }, token);\n      showSuccess(`${popName} has been graduated to alumni!`);\n      setSelectedStudent(null);\n    } catch (err) {\n      setError(err.message || "Failed to graduate student.");\n    } finally {\n      setGraduating(false);\n    }\n  };' "$FILE"

# Add button after Parent invite button
sed -i '/👪 Parent invite link/{n;n;n;a\\\n              <button\n                type="button"\n                className="btn btn-primary btn-sm"\n                style={{ marginTop: "0.5rem", width: "100%" }}\n                onClick={handleGraduate}\n                disabled={graduating}\n              >\n                {graduating ? "🎓 Graduating..." : "🎓 Graduate to Alumni"}\n              </button>
}' "$FILE"

echo "Done"
