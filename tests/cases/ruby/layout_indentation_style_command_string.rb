x = `echo
	hello`
y = <<`HELLO`
	echo hello
HELLO
p x, y
