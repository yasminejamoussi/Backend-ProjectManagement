const Role = require('../models/Role');
const User = require('../models/User');
const sendRoleEmail = require('../utils/roleEmail');

exports.getRoles = async (req, res) => {
  try {
    // Fetch all roles
    const roles = await Role.find();

    // For each role, fetch users who have this role assigned in the User model
    const rolesWithUsers = await Promise.all(
      roles.map(async (role) => {
        const users = await User.find({ role: role._id })
          .select('firstname lastname')
          .lean();
        return { ...role.toObject(), users };
      })
    );

    res.status(200).json(rolesWithUsers);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name || !['Admin', 'Project Manager', 'Team Leader', 'Team Member', 'Guest'].includes(name)) {
      return res.status(400).json({ message: 'Invalid role name' });
    }
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({ message: 'Role already exists' });
    }
    const role = new Role({ name, permissions });
    await role.save();
    res.status(201).json({ message: 'Role created successfully', role });
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, permissions } = req.body;
    if (name && !['Admin', 'Project Manager', 'Team Leader', 'Team Member', 'Guest'].includes(name)) {
      return res.status(400).json({ message: 'Invalid role name' });
    }
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    if (name) role.name = name;
    if (permissions) role.permissions = permissions;
    await role.save();
    res.status(200).json({ message: 'Role updated successfully', role });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    if (role.name === 'Guest') {
      return res.status(400).json({ message: 'Cannot delete Guest role' });
    }
    const guestRole = await Role.findOne({ name: 'Guest' });
    await User.updateMany({ role: roleId }, { $set: { role: guestRole._id } });
    await Role.findByIdAndDelete(roleId);
    res.status(200).json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.assignRoleToUser = async (req, res) => {
  try {
    const { roleName, userId } = req.body;
    console.log('assignRoleToUser called with:', { roleName, userId });

    if (!roleName || !userId) {
      console.error('Missing roleName or userId:', { roleName, userId });
      return res.status(400).json({ message: 'Role name and user ID are required' });
    }

    const validRoles = ['Admin', 'Project Manager', 'Team Leader', 'Team Member', 'Guest'];
    if (!validRoles.includes(roleName)) {
      console.error('Invalid role name:', roleName);
      return res.status(400).json({ message: `Invalid role name. Must be one of: ${validRoles.join(', ')}` });
    }

    const user = await User.findById(userId).populate('role');
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    const role = await Role.findOne({ name: roleName });
    if (!role) {
      console.error('Role not found:', roleName);
      return res.status(404).json({ message: `Role ${roleName} not found` });
    }

    if (user.role && user.role.name === roleName) {
      console.log(`User ${user.email} already has role ${roleName}`);
      return res.status(200).json({ message: 'User already has this role', user, role });
    }

    // Update role assignments
    const previousRole = await Role.findById(user.role);
    if (previousRole) {
      previousRole.users = previousRole.users.filter(
        (id) => id.toString() !== userId.toString()
      );
      await previousRole.save();
    }

    user.role = role._id;
    if (!role.users.includes(userId)) {
      role.users.push(userId);
    }

    // Save changes before sending email
    await user.save();
    await role.save();

    console.log(`User role updated: ${user.email} to ${roleName}`);

    // Send email
    try {
      const subject = 'Your New Role Assignment in Orkestra';
      const text = `Dear ${user.firstname || 'User'},\n\nYou have been assigned the role of ${roleName} in Orkestra. Enjoy your new privileges!\n\nBest regards,\nThe Orkestra Team`;
      const html = `
        <h2>Welcome to Your New Role!</h2>
        <p>Dear ${user.firstname || 'User'},</p>
        <p>You have been assigned the role of <strong>${roleName}</strong> in Orkestra.</p>
        <p>Enjoy your new privileges and explore the platform!</p>
        <p>Best regards,<br>The Orkestra Team</p>
      `;
      await sendRoleEmail(user.email, subject, text, html, userId.toString());
      console.log(`Role email sent to ${user.email} for role ${roleName}`);
    } catch (emailError) {
      console.error('Error sending role email:', emailError);
      return res.status(200).json({
        message: 'Role assigned successfully, but failed to send email',
        user,
        role,
        emailError: emailError.message,
      });
    }

    res.status(200).json({ message: 'Role assigned successfully', user, role });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.initializeRoles = async () => {
  try {
    const roles = [
      { name: 'Admin', permissions: ['all'] },
      { name: 'Project Manager', permissions: ['manage_projects', 'assign_tasks'] },
      { name: 'Team Leader', permissions: ['manage_tasks', 'view_reports'] },
      { name: 'Team Member', permissions: ['complete_tasks'] },
      { name: 'Guest', permissions: ['view_limited'] },
    ];

    for (const roleData of roles) {
      const existingRole = await Role.findOne({ name: roleData.name });
      if (!existingRole) {
        const role = new Role(roleData);
        await role.save();
        console.log(`Role ${roleData.name} initialized`);
      }
    }
  } catch (error) {
    console.error('Error initializing roles:', error);
  }
};