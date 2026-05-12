# Real Name Fields - Complete Implementation Guide

## Overview
This document identifies all locations where "Real Name" (Full Name) fields should be added or improved across the application.

---

## 1. SIGNUP & REGISTRATION FORMS

### 1.1 Student Registration
**File**: `frontend/src/pages/Register.jsx`
**Current State**: ✅ Has `form.name` field (required)
**Label**: "Amazina Yuzuye" (Full Names in Kinyarwanda)
**Improvements Needed**:
- ✅ Already properly labeled as "Amazina Yuzuye" (Full Names)
- ✅ Already required
- Consider adding placeholder hint: "e.g., John Mukamana Karenzo"

**Code Location**: Lines 140-147
```jsx
<div className="form-group">
  <label>Amazina Yuzuye</label>
  <input
    type="text"
    value={form.name}
    onChange={(e) => setForm({ ...form, name: e.target.value })}
    placeholder="Amazina yawe yuzuye"
    required
  />
</div>
```

### 1.2 Teacher Registration
**File**: `frontend/src/pages/Register.jsx`
**Current State**: ✅ Has `form.name` field (required)
**Improvements Needed**:
- ✅ Same as student registration
- ✅ Currently required
- Add note: "Your full legal name (used for school records)"

### 1.3 Head Teacher Registration
**File**: `frontend/src/pages/Register.jsx`
**Current State**: ✅ Has both:
- `form.name` - for their personal account
- `form.head_teacher_name` - for school profile
**Improvements Needed**:
- ✅ Already has both fields
- Ensure both are labeled clearly in the form (name = personal, head_teacher_name = school profile)
- Current: `head_teacher_name` at line ~80 in Register.jsx

---

## 2. ADMIN FORMS (User Creation)

### 2.1 Admin Create Student (Single)
**File**: `frontend/src/components/admin/AdminStudents.jsx`
**Current State**: ✅ Has `createForm.name` field
**Improvements Needed**:
- ✅ Field exists and required
- Add label "Student Full Name" with placeholder
- Show name prominently in created credentials table

**Code Location**: Lines 60-75 (approximately)
```jsx
// Current:
if (!createForm.name.trim()) return setError('Student name is required.');

// Add visual label/placeholder in form:
<input
  type="text"
  value={createForm.name}
  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
  placeholder="Full name (e.g., Amina Uwizeye)"
  required
/>
```

### 2.2 Admin Bulk Create Students
**File**: `frontend/src/components/admin/AdminStudents.jsx`
**Current State**: ✅ Has `bulkForm.names_text` field
**Improvements Needed**:
- ✅ Field exists
- Add helper text: "Enter ONE FULL NAME per line (e.g., John Njoroge, Mary Kamau)"
- Display names in results table

**Code Location**: Bulk form section
```jsx
// Add to form:
<label>Student Names (one full name per line)</label>
<textarea
  value={bulkForm.names_text}
  onChange={(e) => setBulkForm({ ...bulkForm, names_text: e.target.value })}
  placeholder="Mary Uwizeye&#10;Jean Paul Habiyambere&#10;Diane Mukamyuza"
/>
```

### 2.3 Admin Create Teacher
**File**: `frontend/src/components/admin/AdminTeachers.jsx`
**Current State**: ⚠️ Need to verify
**Improvements Needed**:
- Ensure teacher creation form has "Full Name" field
- Show name clearly in generated credentials
- Add validation requiring full name

### 2.4 Admin Create Head Teacher
**File**: `frontend/src/components/admin/AdminSchools.jsx` or `AdminTeachers.jsx`
**Current State**: ⚠️ Partially implemented
**Improvements Needed**:
- Ensure "Head Teacher Full Name" field is present when creating school
- Currently may have `head_teacher_name` in schema
- Add to form with clear label: "Head Teacher Full Name"
- Show in school details display

---

## 3. DASHBOARDS & USER INFO DISPLAYS

### 3.1 Admin Dashboard - User Info Bar
**File**: `frontend/src/pages/AdminDashboard.jsx`
**Current State**: ✅ Shows `user?.name`
**Code Location**: Line ~147
```jsx
<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
  👤 {user?.name}
  <VerifiedBadge size={14} info={{ items: [
    { icon: '🔐', label: 'Role', value: 'Admin' },
    { icon: '📧', label: 'Email', value: user?.email },
  ] }} />
</span>
```
**Improvements Needed**:
- ✅ Already shows name
- Add verified badge showing: Role, Email, Full Name all clearly

### 3.2 Teacher Dashboard
**File**: `frontend/src/pages/TeacherDashboard.jsx`
**Current State**: ⚠️ Need to verify
**Improvements Needed**:
- Display teacher's full name prominently in header/topbar
- Show: "Welcome, [Full Name]"
- Display in any teacher profile sections

### 3.3 Student Dashboard
**File**: `frontend/src/pages/StudentDashboard.jsx`
**Current State**: ⚠️ Need to verify
**Improvements Needed**:
- Display student's full name prominently
- Show in dashboard greeting/header
- Display in student info section

### 3.4 School Board (Head Teacher)
**File**: `frontend/src/pages/SchoolBoard.jsx`
**Current State**: ✅ Shows `school?.head_teacher_name`
**Improvements Needed**:
- ✅ Already shows head teacher name in school details
- Ensure it's in the header: "Head Teacher: [Name]"
- Show logged-in user's name: `user?.name`

### 3.5 Profile Page - User Info Display
**File**: `frontend/src/pages/Profile.jsx`
**Current State**: ✅ Has `profile` object
**Improvements Needed**:
- Display user's full name at top: "📝 [Full Name]"
- Allow editing name in edit mode
- Show in profile header clearly

**Code Location**: Need to add name display
```jsx
// Add to Profile page header:
<h2>👤 {profile?.name || user?.name}</h2>
```

---

## 4. MODALS & POPUP WINDOWS

### 4.1 Create Class Modal
**File**: `frontend/src/components/CreateClassModal.jsx`
**Current State**: ⚠️ May not show teacher name
**Improvements Needed**:
- If showing teacher who creates class, display: "Created by: [Full Name]"
- Store `created_by_name` or use `teacher?.name`

### 4.2 Create Quiz Modal
**File**: `frontend/src/components/CreateQuizModal.jsx`
**Current State**: ⚠️ May not show teacher name
**Improvements Needed**:
- Show: "Quiz created by: [Teacher Full Name]"

### 4.3 Classmate Profile Modal
**File**: `frontend/src/components/ClassmateProfileModal.jsx`
**Current State**: ⚠️ May show name only partially
**Improvements Needed**:
- Display prominently: "📝 [Full Name]"
- Show in modal header
- Use `classmate?.name`

### 4.4 Share Modal
**File**: `frontend/src/components/ShareModal.jsx`
**Current State**: ⚠️ May show incomplete names
**Improvements Needed**:
- When showing student shares, display: "By: [Full Name]"
- Use `share?.user_name` or similar field

### 4.5 View As Modal (Impersonation)
**File**: `frontend/src/pages/AdminDashboard.jsx` (in openViewAs function)
**Current State**: ✅ Loads teachers and students
**Improvements Needed**:
- When displaying list, show: `[icon] Name (Role) - Email`
- Display teacher/student full names in dropdown/list
- Add name to dropdown: `teacher.name` or `student.name`

**Code Location**: Lines ~55-75
```jsx
// Show full details in dropdown:
{teachers.map(t => (
  <option key={t.id} value={t.id}>
    {t.name} (Teacher) - {t.email}
  </option>
))}
```

---

## 5. DATA TABLES & LISTS

### 5.1 Students List (Admin)
**File**: `frontend/src/components/admin/AdminStudents.jsx`
**Current State**: ✅ Filters by name
**Code Location**: Lines ~95-100
```jsx
const filtered = students.filter(s =>
  (s.name || '').toLowerCase().includes(q) ||
  (s.email || '').toLowerCase().includes(q)
);
```
**Improvements Needed**:
- ✅ Already shows name in list
- Ensure table header: "Full Name | Email | School | Actions"
- Display full name prominently as first column

### 5.2 Teachers List (Admin)
**File**: `frontend/src/components/admin/AdminTeachers.jsx`
**Current State**: ⚠️ Need to verify
**Improvements Needed**:
- Show "Full Name" column as primary identifier
- Sort by name by default
- Ensure full names searchable

### 5.3 Schools List (Admin)
**File**: `frontend/src/components/admin/AdminSchools.jsx`
**Current State**: ⚠️ Partial
**Improvements Needed**:
- Show "Head Teacher Name" column
- Display: `school.head_teacher_name`
- Include in edit form

### 5.4 Classes List
**File**: Various class listing pages
**Current State**: ⚠️ May not show teacher name
**Improvements Needed**:
- When listing classes, show: "📚 Class Name | Teacher: [Full Name]"
- Use `class?.teacher_name` or `teacher?.name`

### 5.5 Student Shares/Articles List
**File**: `frontend/src/components/StudentShareFeed.jsx`
**Current State**: ⚠️ May show partial name info
**Improvements Needed**:
- When displaying shares, show: "By: [Full Name]"
- Add `user_name` field to shares in backend
- Display prominently

---

## 6. BACKEND ROUTES (Ensure Name Field Returned)

### 6.1 Authentication Routes
**File**: `backend/routes/auth.js`
**Current State**: ✅ Returns `user` object with `name`
**Improvements Needed**:
- ✅ Already includes name in login/register responses
- Ensure all auth endpoints return: `{ ..., name, email, role, school_id, ... }`

### 6.2 Admin Routes
**File**: `backend/routes/admin.js`
**Current State**: ✅ Creates/returns students with name
**Improvements Needed**:
- ✅ Already returns name in `/admin/students` endpoints
- ✅ Already returns name in `/admin/students/bulk-create`
- Ensure `/admin/teachers` returns full name
- Ensure `/admin/schools` returns `head_teacher_name` in GET responses

**Current Code Location**: 
```js
// POST /admin/students - already includes:
const created = await db.query(
  'INSERT INTO users (name, email, ...) VALUES (...) RETURNING id, name, email, ...'
);
```

### 6.3 Profile Routes
**File**: `backend/routes/profile.js` or similar
**Current State**: ⚠️ May need verification
**Improvements Needed**:
- Ensure GET `/profile/me` returns `name` field
- Ensure GET `/profile/{id}` returns full name if accessible

### 6.4 Classes & Content Routes
**File**: `backend/routes/classes.js`, `backend/routes/content.js`
**Current State**: ⚠️ May not include teacher/creator name
**Improvements Needed**:
- When returning classes, include teacher name
- When returning content, include creator name
- SQL: `SELECT c.id, c.name, u.name as teacher_name FROM classes c JOIN users u ON c.teacher_id = u.id`

---

## 7. SPECIFIC FORM IMPROVEMENTS

### Add to all user creation forms:
1. **Label Enhancement**: Change from generic "Name" to "Full Name" or "Amazina Yuzuye" (Full Names)
2. **Placeholder**: Add examples like "John Mukamana Karenzo"
3. **Validation**: Ensure at least 2+ words (first and last name)
4. **Display**: Always show created username with full name: "✅ Student: John Mukamana | Email: john@school.edu"
5. **Visible Confirmation**: When user is created, prominently display: "Full Name: [Name]"

---

## 8. DATABASE/API RESPONSE CHECKLIST

**Ensure all endpoints return `name` field:**
- [ ] `POST /auth/register` - returns user with name ✅
- [ ] `POST /auth/login` - returns user with name ✅
- [ ] `GET /admin/students` - returns list with names ✅
- [ ] `POST /admin/students` - returns created student with name ✅
- [ ] `POST /admin/students/bulk-create` - returns created names ✅
- [ ] `GET /admin/teachers` - returns teacher names ⚠️
- [ ] `POST /admin/teachers` - returns teacher names ⚠️
- [ ] `GET /admin/schools` - returns head_teacher_name ⚠️
- [ ] `GET /profile/me` - returns user name ✅
- [ ] `GET /classes` - returns teacher names ⚠️
- [ ] `GET /classes/:id` - returns teacher name ⚠️
- [ ] `GET /admin/impersonate` - returns user name ✅

---

## 9. PRIORITY IMPLEMENTATION ORDER

### Phase 1 - HIGH PRIORITY (Already have fields, just need UI improvements)
1. ✅ Register.jsx - name field already good, just ensure placeholder
2. ✅ AdminStudents.jsx - enhance label, show in results
3. ✅ AdminDashboard.jsx - already shows name, ensure prominence
4. ✅ SchoolBoard.jsx - already shows head_teacher_name
5. Profile.jsx - add name display at top

### Phase 2 - MEDIUM PRIORITY (Need verification)
1. TeacherDashboard.jsx - add name display
2. StudentDashboard.jsx - add name display
3. AdminTeachers.jsx - verify name field, enhance display
4. AdminSchools.jsx - add head_teacher_name to form

### Phase 3 - LOWER PRIORITY (Enhancement)
1. Modals (CreateClass, CreateQuiz, ClassmateProfile, Share)
2. Tables/Lists - add name columns where missing
3. Backend routes - verify all return name fields

---

## 10. EXAMPLE: Complete Form Pattern

**When creating a user, follow this pattern:**

```jsx
// INPUT SECTION
<div className="form-group">
  <label>📝 Student Full Name</label>
  <input
    type="text"
    value={form.name}
    onChange={(e) => setForm({ ...form, name: e.target.value })}
    placeholder="e.g., Mary Uwizeye Kigera"
    required
    minLength={3}
  />
  <small>Enter full legal name (first + last names)</small>
</div>

// RESULT SECTION
{createdCredentials.length > 0 && (
  <div className="credentials-box">
    <h4>✅ Student Created</h4>
    <p><strong>Full Name:</strong> {createdCredentials[0].name}</p>
    <p><strong>Email:</strong> {createdCredentials[0].email}</p>
    <p><strong>Password:</strong> {createdCredentials[0].password}</p>
  </div>
)}
```

---

## 11. EMAIL GENERATION - Name Integration

**When auto-generating student email:**
- Use full name to create email: `firstname.lastname@school.edu`
- Keep full name in display: "Email: [Full Name] ([email])"
- Store both name and generated email
- Example: "Mary Uwizeye" → "mary.uwizeye@brightschool.edu"

**Current Implementation**:
- Backend already does this in `admin.js` `/students/bulk-create`
- Frontend needs to display name+email pair more clearly

---

## Files to Update (Summary)

1. **frontend/src/pages/Register.jsx** - Enhance placeholders
2. **frontend/src/pages/Profile.jsx** - Add name display
3. **frontend/src/pages/AdminDashboard.jsx** - Verify prominence
4. **frontend/src/pages/TeacherDashboard.jsx** - Add name display
5. **frontend/src/pages/StudentDashboard.jsx** - Add name display
6. **frontend/src/pages/SchoolBoard.jsx** - Verify head teacher name display
7. **frontend/src/components/admin/AdminStudents.jsx** - Enhance labels and results display
8. **frontend/src/components/admin/AdminTeachers.jsx** - Verify and enhance
9. **frontend/src/components/admin/AdminSchools.jsx** - Add head_teacher_name form field
10. **frontend/src/components/ClassmateProfileModal.jsx** - Add name display
11. **backend/routes/admin.js** - Verify all endpoints return names

