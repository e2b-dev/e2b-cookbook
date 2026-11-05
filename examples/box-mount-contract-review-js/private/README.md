# Box Mount package goes here

Box Mount is in private preview and has no public package yet. Request access with the form in Box's [Box Mount guide](https://developer.box.com/guides/box-mount); Box sends you a Linux build.

Drop that file into this folder as is: the `.tar.gz`, `.tgz` or `.zip` archive, or the bare `box-mount` binary. Then run `npm run build-template`. The build unpacks the archive, finds the one Linux executable in it and installs it in the template as `box-mount`.

Everything in this folder except this README is git-ignored, so the binary stays on your machine.
